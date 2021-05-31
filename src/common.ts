import {Session} from './session'

export const browserCheck = new Function("try {return this===window;}catch(e){ return false;}");
let is_browser = browserCheck();

export interface LocaleFn {
    (locale:string):void
}

export class RPCError extends Error {
    code: number
    sql: string

    constructor( msg: any ) {
        super(msg[ 'message' ])

        this.code = 'code' in msg ? msg[ 'code' ] : -1
        this.sql = 'sql' in msg ? msg[ 'sql' ] : ''
    }
}

// Simple function the checks the response types and return json or throw error 
export async function FetchAsJson( res: Response ) {
    let content_type = res.headers.get('Content-Type')

    if (typeof content_type == 'string' && content_type.match( 'application/json' ))
        return await res.json()
    
    throw Error(`Content is not json but it is of type ${content_type}`)
}

// Make common actions on a fetch call, to handle errors and handle session cookies
// will throw exceptions on all kinds of error
export async function FetchResponse( sess: Session, res: Response ) {
    if( res.ok ) {
        if( res.status != 200 ) {
            let err_body = await res.text()

            throw new Error(`bad http response : ${err_body}`)
        }

        if( res.headers.has( 'content-language' )) {
            let locale = res.headers.get( 'content-language' )

            if( typeof locale == 'string')
                sess.locale_check( locale )
        }

        // If not a browser, get cookie from response and set it on next header
        // XXX this is a quick fix and does not replace a real cookie jar 
        if (!is_browser && res.headers.has("Set-Cookie")) {
            let cookies = res.headers.get('Set-Cookie')

            if( typeof cookies == 'string' ) {
                let m = /(.+?)=([^;]*)/.exec( cookies )

                if( m ) 
                    sess.header_add( "Cookie", `${m[1]}=${m[2]}` )
            }
        }

        return
    }        

    let text = await res.text()
    throw new Error( `HTTP error ${res.status} : ${text}` )
}