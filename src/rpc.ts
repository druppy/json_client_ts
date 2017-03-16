import {locale_check, headers_get, rpc_url_get, service_url_get} from './common'

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
export function rpc_names() : Promise<string[]> {
    return new Promise<string[]>((resolve, reject) => {
        fetch_smd().then( res => {
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

export function fetch_smd() : Promise<Methods> {
    return new Promise<Methods>((resolve, reject) => {
        fetch( service_url_get( '/service.smd' ), {} ).then(( res )=> {
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
export function rpc<T extends Object>( method: string, ...args: any[] ) : Promise<T> {
    return new Promise<T>((resolve, reject) => {
            var id = last_rpc_seq_id++;

            let envelope = {
                'jsonrpc': '2.0',
                'id': id,
                'method': method,
                'params': args
            };

            let h = headers_get();
            h.append('Content-Type', 'application/json')

            // Time to use a propper request handler from ES6
            let conn = fetch( rpc_url_get(), {
                method: 'POST',
                credentials: 'same-origin',
                body: JSON.stringify( envelope ),
                cache: 'no-store',
                headers: h
            }).then((response) => {
                if(response.status != 200) {
                    //console.error( 'RPC HTTP error ', response.status, ':', response.statusText );

                    reject({message: `RPC HTTP communication error ${response.status}`, code: -1})
                } else {
                    if( response.headers.has( 'content-language' )) {
                        let locale = response.headers.get( 'content-language' )
                        
                        locale_check( locale )
                    }

                    if (response.headers.get('Content-Type').match( 'application/json' )) {
                        response.json().then((res) => {
                            if( res[ 'id' ] == id ) {
                                if( 'error' in res ) {
                                    // An error in the logic, user need to take action
                                    //console.error( 'RPC method error ', res[ 'error' ] )

                                    reject( res[ 'error' ] )
                                } else if( 'result' in res ) {
                                    resolve( res[ 'result' ] )
                                } else {
                                    //console.error( 'RPC unknown answer ', res )
                                }
                            } else {
                                // We should never end up here, and if we do the error need to be analized 
                                //console.error( 'RPC protocol error for ', method, ' payload ',
                                //    JSON.stringify(envelope), ' result ', res )

                                reject({message: 'jsonrpc sequence mismatch in method ' + method, code: -1})
                            }
                        })
                    } else
                        reject({message: 'RPC response not json encoded, but ' + response.headers.get('Content-Type'), code: -1})
                }
            }).catch((error) => {
                // the backend is gone ...
                //console.error( 'RPC comm error ', error )

                reject({message:error, code: -1})
            });
        }
    )
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
            let h = headers_get()
            h.append('Content-Type', 'application/json')

            fetch( rpc_url_get(), {
                method: 'POST',
                credentials: 'same-origin',
                body: JSON.stringify( this.payload ),
                cache: 'no-store',
                headers: h
            }).then((response) => {
                if(response.status != 200) {
                    //console.error( 'RPC HTTP error ', response.status, ' ', response.statusText )

                    reject({message: `RPC HTTP communication error ${response.status}`, code: -1})
                } else {
                    if (response.headers.get('Content-Type').match( 'application/json' )) {
                        response.json().then((res) => {
                            for( let r of res ) {
                                let id = parseInt( r[ 'id' ] )

                                if( id in this.ids ) {
                                    let cur = this.ids[ id ]

                                    if( 'result' in res )
                                        cur.resolve( res[ 'result' ])
                                    else
                                        cur.reject( res[ 'error' ])
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
