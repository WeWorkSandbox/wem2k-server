import { IConfig } from 'config'
import express from 'express'
import fs from 'fs'
import http from 'http'
import path from 'path'
import temp from 'temp'
import Server from '../lib/server'
import MockConfig from './mock'
import * as rb from './requestBuilder'
import StaticServer from './staticServer'
import portfinder from 'portfinder'

const tempFile: typeof temp = temp.track()

/*
* Make a temporary javascript file with the string as contents.
* @param text The text to write to the file
* @returns a Promise with the path of the file created
*/
function makeTempJSFile(text: string, options: any = {}): Promise<string> {
  return new Promise<temp.OpenFile>((resolve, reject) => {
    options.suffix = '.js'
    tempFile.track()
    tempFile.open(options, (err: any, info: temp.OpenFile) => {
      if (err) {
        return reject(err)
      }
      return resolve(info)
    })
  }).then((info: temp.OpenFile): Promise<temp.OpenFile> => {
    return new Promise<temp.OpenFile>((resolve, reject) => {
      fs.write(info.fd, text, (err: NodeJS.ErrnoException) => {
        if (err) {
          return reject(err)
        }
        return resolve(info)
      })
    })

  }).then((info: temp.OpenFile) => {
    return new Promise<string>((resolve, reject) => {
      fs.close(info.fd, (err: NodeJS.ErrnoException) => {
        if (err) {
          return reject(err)
        }
        return resolve(info.path)
      })
    })
  })
}

function cleanupTempFiles(): Promise<temp.Stats> {
  return new Promise((resolve, reject) => {
    // https://github.com/DefinitelyTyped/DefinitelyTyped/pull/34874
    (tempFile as any).cleanup((err: any, stats: temp.Stats) => {
      if (err) {
        reject(err)
      }
      return resolve(stats)
    })
  })
}

function getFreePort(): Promise<any> {
  return new Promise((resolve, reject) => {
    portfinder.getPortPromise()
      .then((port) => {
        return resolve(port)
      })
      .catch((err) => {
        reject(err)
      })
  })
}

describe('The WeM2k mocking server', () => {
  let freePort: any
  beforeAll(async () => {
    freePort = await getFreePort().then((freePort: any): Promise<[any]> => {
      return freePort
    })
  })
  describe('when there is no mocking config', () => {
    let config: IConfig
    let requestBuilder: rb.RequestBuilder
    let mockServer: Server
    let responseGenerator: StaticServer

    beforeAll((): Promise<[http.Server, http.Server]> => {
      config = new MockConfig({
        port: freePort,
        responseGenerator: 'http://localhost:1111',
      })
      requestBuilder = new rb.RequestBuilder(config)
      responseGenerator = new StaticServer(1111, (app: express.Express) => {
        app.get('/route1', (_0: express.Request, res: express.Response, _1: express.NextFunction): any => {
          res.status(200).send('Hello World!')
        })
        app.get('/route2', (_0: express.Request, res: express.Response, _1: express.NextFunction): any => {
          res.status(201).send('Another response')
        })
      })
      mockServer = new Server(config)
      return Promise.all([mockServer.start(), responseGenerator.start()])
    })
    afterAll(() => {
      return Promise.all([mockServer.stop(), responseGenerator.stop(), cleanupTempFiles()])
    })
    test('and the route is valid, it replies with values from the response generator', () => {
      return requestBuilder.request('get', '/route1').then((response: rb.RBResponse) => {
        expect(response.response.statusCode).toEqual(200)
        expect(response.body).toEqual('Hello World!')
      }).then(() => {
        return requestBuilder.request('get', '/route2')
      }).then((response: rb.RBResponse) => {
        expect(response.response.statusCode).toEqual(201)
        expect(response.body).toEqual('Another response')
      })
    })
    test('and the route is valid, it replies with values from the response generator', () => {
      return requestBuilder.request('get', '/route1').then((response: rb.RBResponse) => {
        expect(response.response.statusCode).toEqual(200)
        expect(response.body).toEqual('Hello World!')
      }).then(() => {
        return requestBuilder.request('get', '/route2')
      }).then((response: rb.RBResponse) => {
        expect(response.response.statusCode).toEqual(201)
        expect(response.body).toEqual('Another response')
      })
    })
    test('and the route is invalid, it replies with a 404 from the response generator', () => {
      return requestBuilder.request('get', '/route3').then((response: rb.RBResponse) => {
        expect(response.response.statusCode).toEqual(404)
      })
    })
  })
  describe('when there is a mock config', () => {
    let config: IConfig
    let requestBuilder: rb.RequestBuilder
    let responseGenerator: StaticServer
    let mockServer: Server

    beforeAll((): Promise<[http.Server, http.Server]> => {
      return makeTempJSFile('\
WeM2k.mock()\n\
     .get("/route1")\n\
     .reply(200, "This is the new body")\n\
WeM2k.mock()\n\
     .get("/route2")\n\
     .replyWithDefault(201, function (body){\n\
        return body + " form of lion"\n\
     })\n').then((fileName: string): Promise<[http.Server, http.Server]> => {
        config = new MockConfig({
          port: freePort,
          responseGenerator: 'http://localhost:1112',
          serverConfig: fileName,
        })
        requestBuilder = new rb.RequestBuilder(config)
        responseGenerator = new StaticServer(1112, (app: express.Express) => {
          app.get('/route1', (_0: express.Request, res: express.Response, _1: express.NextFunction): any => {
            res.status(200).send('Hello World!')
          })
          app.get('/route2', (_0: express.Request, res: express.Response, _1: express.NextFunction): any => {
            res.status(200).send('Wonder twins activate,')
          })
          app.get('/route3', (_0: express.Request, res: express.Response, _1: express.NextFunction): any => {
            res.status(200).send('Let me in')
          })
        })
        mockServer = new Server(config)
        return Promise.all([mockServer.start(), responseGenerator.start()])
      })
    })
    afterAll(() => {
      return Promise.all([mockServer.stop(), responseGenerator.stop(), cleanupTempFiles()])
    })

    test('it returns replies from the mock configuration file', () => {
      return requestBuilder.request('get', '/route1').then((response: rb.RBResponse) => {
        expect(response.response.statusCode).toEqual(200)
        expect(response.body).toEqual('This is the new body')
      })
    })
    test('it can use the default response from the response generator', () => {
      return requestBuilder.request('get', '/route2').then((response: rb.RBResponse) => {
        expect(response.response.statusCode).toEqual(201)
        expect(response.body).toEqual('Wonder twins activate, form of lion')
      })
    })
    test('it defaults to the response generator for un-mocked calls', () => {
      return requestBuilder.request('get', '/route3').then((response: rb.RBResponse) => {
        expect(response.response.statusCode).toEqual(200)
        expect(response.body).toEqual('Let me in')
      })
    })
  })
  describe('when the server is running', () => {
    let config: IConfig
    let requestBuilder: rb.RequestBuilder
    let responseGenerator: StaticServer
    let mockServer: Server

    beforeAll((): Promise<[http.Server, http.Server]> => {
      config = new MockConfig({
        port: freePort,
        responseGenerator: 'http://localhost:1113',
      })
      requestBuilder = new rb.RequestBuilder(config)
      responseGenerator = new StaticServer(1113, (app: express.Express) => {
        app.get('/route1', (_0: express.Request, res: express.Response, _1: express.NextFunction): any => {
          res.status(200).send('Hello World!')
        })
      })
      mockServer = new Server(config)
      return Promise.all([mockServer.start(), responseGenerator.start()])
    })
    afterAll(() => {
      return Promise.all([mockServer.stop(), responseGenerator.stop(), cleanupTempFiles()])
    })
    test('it can dynamically configure mocks', () => {
      return requestBuilder.request('get', '/route2').then((response: rb.RBResponse) => {
        expect(response.response.statusCode).toEqual(404)
      }).then(() => {
        return requestBuilder.request('post',
          '/wem2k/v1/update',
          '{ "path": "/route2",\
              "method": "get",\
              "status": "200",\
              "response": "response from newly added mock" }').then((response: rb.RBResponse) => {
            expect(response.response.statusCode).toEqual(204)
          }).then(() => {
            return requestBuilder.request('get', '/route2').then((response: rb.RBResponse) => {
              expect(response.response.statusCode).toEqual(200)
              expect(response.response.body).toEqual('response from newly added mock')
            })
          })
      })
    })
    test('it returns status code 404 - Not Found for undefined WeM2k endpoints', () => {
      return requestBuilder.request('get', '/wem2k/v1/undefined', '{}').then((response: rb.RBResponse) => {
        expect(response.response.statusCode).toEqual(404)
        expect(response.response.body).toEqual('{"message":\
"GET /wem2k/v1/undefined did not match any WeM2k routes."}')
      })
    })
    test('it returns status code 422 - Unprocessable Entity for invalid mocks', () => {
      return requestBuilder.request('post',
        '/wem2k/v1/update',
        '{  "path": "/route2",\
            "status": "200",\
            "response": "response from newly added mock" }').then((response: rb.RBResponse) => {
          expect(response.response.statusCode).toEqual(422)
          expect(response.response.body).toEqual('{"message":"Could not process request. Invalid mock definition."}')
        })
    })
  })
  describe('when the mock config has a relative path', () => {
    test('it loads files based off of the cwd', () => {
      return makeTempJSFile('', { dir: process.cwd() }).then((fileName: string): Promise<http.Server> => {
        let basePath = path.basename(fileName)
        basePath = './' + basePath
        const config = new MockConfig({
          port: freePort,
          serverConfig: basePath,
        })
        const mockServer = new Server(config)
        return mockServer.start()
      }).then((server: http.Server) => {
        return Promise.all([server.close(), cleanupTempFiles()])
      }, (err: any) => {
        fail(`The server failed to start do to ${err}`)
      })
    })
    test('it can load modules in the cwd', () => {
      return makeTempJSFile('', { dir: process.cwd() }).then((fileName: string): Promise<http.Server> => {
        const modPath = path.basename(fileName).split('.js')[0]
        const config = new MockConfig({
          port: freePort,
          serverConfig: modPath,
        })
        const mockServer = new Server(config)
        return mockServer.start()
      }).then((server: http.Server) => {
        return Promise.all([server.close(), cleanupTempFiles()])
      }, (err: any) => {
        fail(`The server failed to start due to ${err}`)
      })
    })
  })
  describe('when there is no response generator', () => {
    let config: IConfig
    let requestBuilder: rb.RequestBuilder
    let mockServer: Server

    beforeAll((): Promise<void | http.Server> => {
      return makeTempJSFile('\
  WeM2k.mock()\n\
     .get("/route1")\n\
     .reply(200, "This is the new body")\n').then((fileName: string): Promise<http.Server> => {
        config = new MockConfig({
          port: freePort,
          serverConfig: fileName,
        })
        requestBuilder = new rb.RequestBuilder(config)
        mockServer = new Server(config)
        return mockServer.start()
      }).then((server: http.Server) => {
        return server
      }, (err: any) => {
        fail(`An unexpected error occurred ${err}`)
      })
    })
    afterAll(() => {
      return Promise.all([mockServer.stop(), cleanupTempFiles()])
    })

    test('it works for mocked calls', () => {
      return requestBuilder.request('get', '/route1').then((response: rb.RBResponse) => {
        expect(response.response.statusCode).toEqual(200)
        expect(response.body).toEqual('This is the new body')
      })
    })
    test('and the call is un-mocked, it replies with an error explaining what needs to be matched', () => {
      return requestBuilder.request('get', '/unMocked').then((response: rb.RBResponse) => {
        expect(response.response.statusCode).toEqual(501)
        expect(response.body).toMatch(/misconfigured.*No match.*unMocked/s)
      }, (_: any) => {
        fail('The request should not have returned an error.')
      })
    })
  })
})
