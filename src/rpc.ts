import {RPCError, FetchResponse, FetchAsJson} from './common'
import {Session} from './session'


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
export async function rpc_names_sess(sess: Session) {   
    let res = fetch_smd_sess(sess)
    var n : string[] = []

    for( let m in res ) 
        n.push( m )

    return n
}

export async function fetch_smd_sess(sess: Session) {
    let res = await fetch( sess.service_url_get( '/service.smd' ), {} )
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

    return methods 
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

    await FetchResponse( sess, response )
    const res = await FetchAsJson( response )

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

    public async commit() {
        let h = this.sess.headers_get()
        h.append('Content-Type', 'application/json')

        let response = await fetch( this.sess.rpc_url_get(), {
            method: 'POST',
            credentials: 'same-origin',
            body: JSON.stringify( this.payload ),
            cache: 'no-store',
            headers: h
        })

        await FetchResponse(this.sess, response )
        const res = await FetchAsJson( response )

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

        // Reset states to make it possible use this instance as a new batch
        this.payload = []
        this.ids = {}
        this.last_id = 0
    }    
    
}