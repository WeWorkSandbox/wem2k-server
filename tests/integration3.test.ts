import { IConfig } from 'config'
import express from 'express'
import fs from 'fs'
import http from 'http'
import temp from 'temp'
import Server from '../lib/server'
import MockConfig from './mock'
import * as rb from './requestBuilder'
import StaticServer from './staticServer'
import portFinder from 'portfinder'

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

function getFreePort(): any {
    portFinder.getPortPromise()
        .then((port) => {
            console.log("PORT IS ", port)
            return port
        })
        .catch((err) => {
            console.log("ERROR IS ", err)
            return err
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

describe('The WeM2k mocking server', () => {
    describe('when there is no mocking config', () => {
        let config: IConfig
        let requestBuilder: rb.RequestBuilder
        let mockServer: Server
        let responseGenerator: StaticServer

        beforeAll((): Promise<[http.Server, http.Server]> => {
            return getFreePort().then((port: any): Promise<[http.Server, http.Server]> => {
                config = new MockConfig({
                    port: port,
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
                    port: '8002',
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
})
