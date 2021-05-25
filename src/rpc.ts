import {RPCError} from './common'
import {Session} from './session'

let browserCheck = new Function("try {return this===window;}catch(e){ return false;}");
let is_browser = browserCheck();

export interface Param {
    type: string; 
    optional: boolean;
}

export interface Method {
    params: Param[]; 
    return_type: string; 
}

export interface Methods {
    [name:string]: Method
}

// Return a list of method names
export function rpc_names_sess(sess: Session) : Promise<string[]> {
    return new Promise<string[]>((resolve, reject) => {
        fetch_smd_sess(sess).then( res => {
            var n : string[] = []

            for( let m in res ) {
                let method = res[ m ]

                n.push( m )
            }

            resolve( n )
        }).catch(reason => {
            reject( reason )
        })
    })
}

export function fetch_smd_sess(sess: Session) : Promise<Methods> {
    return new Promise<Methods>((resolve, reject) => {
        fetch( sess.service_url_get( '/service.smd' ), {} ).then(( res: {[i:string]:any} )=> {
            let methods: Methods = {}

            for( var name in res['services'] ) {
                var params = res['services'][ name ]

                var method : Method = {
                    return_type: String(params['return']),
                    params: []
                };

                for( let p in params[ 'parameters' ] )
                    method.params.push(<Param><any>p)

                methods[ String( name )] = method
            }

            resolve( methods )
        }).catch( (reason) => {
            reject( reason )
        })
    })
}

var last_rpc_seq_id = 0
export async function rpc_sess<T extends Object>( sess: Session, method: string, ...args: any[] ) {    
    var id = last_rpc_seq_id++;

    const envelope = {
        'jsonrpc': '2.0',
        'id': id,
        'method': method,
        'params': args
    };

    let h = sess.headers_get()
    h.append('Content-Type', 'application/json')

    // Time to use a proper request handler from ES6
    let response = await fetch( sess.rpc_url_get(), {
        method: 'POST',
        credentials: 'same-origin',
        body: JSON.stringify( envelope ),
        cache: 'no-store',
        headers: h
    })

    if(response.ok) {
        if( response.status != 200 ) {
            let err_body = await response.text()

            throw new RPCError({
                message: `bad RPC http response : ${err_body}`,
                code: -1
            })
        }

        if( response.headers.has( 'content-language' )) {
            let locale = response.headers.get( 'content-language' )

            if( typeof locale == 'string')
                sess.locale_check( locale )
        }

        // If not a browser, get cookie from response and set it on next header
        // XXX this is a quick fix and does not replace a real cookie jar 
        if (!is_browser && response.headers.has("Set-Cookie")) {
            let cookies = response.headers.get('Set-Cookie')

            if( typeof cookies == 'string' ) {
                let m = /(.+?)=([^;]*)/.exec( cookies )

                if( m ) 
                    sess.header_add( "Cookie", `${m[1]}=${m[2]}` )
            }
        }

        let content_type = response.headers.get('Content-Type')
        if (typeof content_type == 'string' && content_type.match( 'application/json' )) {
            let res = await response.json()
            if( res[ 'id' ] == id ) {
                if( 'error' in res ) {
                    // An error in the logic, user need to take action
                    //console.error( 'RPC method error ', res[ 'error' ] )

                    throw new RPCError( res[ 'error' ] )
                } else if( 'result' in res ) {
                    return res[ 'result' ] as T
                } else {
                    //console.error( 'RPC unknown answer ', res )
                }
            } else {
                // We should never end up here, and if we do the error need to be analyzed 
                //console.error( 'RPC protocol error for ', method, ' payload ',
                //    JSON.stringify(envelope), ' result ', res )

                throw new RPCError({
                    message: 'jsonrpc sequence mismatch in method ' + method, 
                    code: -1
                })
            }
        } else
            throw new RPCError({
                message: 'RPC response not json encoded, but ' + response.headers.get('Content-Type'), 
                code: -1
            })
    }  
    
    throw new RPCError({ message: `RPC HTTP communication error ${response.status}`, code: -1 })
}

/**
 * Provide a batch that act like normal rpc but it will only execute the rpc functions
 * when the commit function are called and then pack all into one single json request batch
 *
 * When a response returns the rpc functions will be notified as if the normal rpc function
 * has been used
 * */

export class Batch {
    private payload: any[] = []
    private last_id = 0
    private ids: {[key:number]: {resolve: {(res: any) : void}, reject:{( err?: any ) : void} }} = {}
    private sess: Session

    constructor( sess: Session ) {
        this.sess = sess
    }

    public rpc( method: string, ...args: any[] ) : Promise<any> {
        let id = ++this.last_id

        let envelope = {
            'jsonrpc': '2.0',
            'id': id,
            'method': method,
            'params': args
        }

        this.payload.push( envelope )

        let p = new Promise<any>((resolve, reject) => {
            this.ids[ id ] = {
                resolve: resolve,
                reject: reject
            }
        })

        return p
    }

    public commit() : Promise<any> {
        return new Promise<any>((resolve, reject) => {
            let h = this.sess.headers_get()
            h.append('Content-Type', 'application/json')

            fetch( this.sess.rpc_url_get(), {
                method: 'POST',
                credentials: 'same-origin',
                body: JSON.stringify( this.payload ),
                cache: 'no-store',
                headers: h
            }).then((response) => {
                if(!response.ok) {
                    reject(new RPCError({
                        message: `RPC HTTP communication error ${response.status}`, 
                        code: -1
                    }))
                } else {
                    if( response.headers.has( 'content-language' )) {
                        let locale = response.headers.get( 'content-language' )

                        if( typeof locale == 'string')
                            this.sess.locale_check( locale )
                    }

                    // If not a browser, get cookie from responce and set it on next header
                    // XXX this is a quick fix and does not replace a real cookie jar 
                    if (!is_browser && response.headers.has("Set-Cookie")) {
                        let cookies = response.headers.get('Set-Cookie')

                        if( typeof cookies == 'string' ) {
                            let m = /(.+?)=([^;]*)/.exec( cookies )

                            if( m ) 
                                this.sess.header_add( "Cookie", `${m[1]}=${m[2]}` )
                        }
                    }

                    let content_type = response.headers.get('Content-Type')

                    if (typeof content_type == 'string' && content_type.match( 'application/json' )) {
                        response.json().then((res) => {
                            for( let r of res ) {
                                let id = parseInt( r[ 'id' ] )

                                if( id in this.ids ) {
                                    let cur = this.ids[ id ]

                                    if( 'result' in res )
                                        cur.resolve( res[ 'result' ])
                                    else
                                        cur.reject( new RPCError( res[ 'error' ]))
                                }
                            }
                        })
                    }

                    // Reset states to make it possible use this instance as a new batch     
                    this.payload = []
                    this.ids = {}
                }
            })
        })
    }
}
