import {Iter, Entity, WatchCallback} from './store'
import {Session} from './session'
import { FetchResponse, FetchAsJson } from './common'

export class RestError extends Error {
    public body = ""

    constructor(message: string, body: string) {
        super(message)
        this.name = "RestError"
        this.body = body
    }
}

const rest_page_size = 24

/**
    Convert a normal js object to a http query string. All non string values will
    use json stringify and empty values are reflexted too.
    All is properly entity encoded
*/
export function mk_query(params: Object) : string {
    let qs = '';

    for(let key in params) {
        let value = params[key] 

        if( qs.length > 0 )
            qs += '&'

        if( value != null ) {
            if( value instanceof Date)
                value = value.toISOString()
            else if( typeof value != 'string' )
                value = JSON.stringify( value )

            qs += `${encodeURIComponent(key)}=${encodeURIComponent(value)}`
        } else
            qs += encodeURIComponent(key)
    }

    return qs
}

export function mk_url(url: string, params: Object = {}, order: string[] = []) : string {
    let qs = mk_query( params )

    if( order.length > 0 ) {
        if( qs.length > 0 )
            qs += '&'

        qs += `sort(${order.join(',')})`
    }

    if (qs.length > 0)
        url = `${url}?${qs}`

    return url
}

export interface NormalizeFn<Data> {
    (val: any) : Data
}

const items_reg = /items (\d+)-(\d+)\/?(\d*)/
export class RestIter<Data> implements Iter<Data> {
    private total = -1
    private begin_next = 0
    private page_size = rest_page_size
    private entity_name: string
    private nfn?: NormalizeFn<Data>
    private sess: Session
    private options: Options

    private url: string

    constructor( sess: Session, entity_name: string, args: Object, options: Options, order?: string[], offset?: number, limit?: number, nfn?: NormalizeFn<Data> ) {
        this.sess = sess
        this.entity_name = entity_name
        
        if( nfn != undefined )
            this.nfn = nfn
        if( offset != undefined )
            this.begin_next = offset
        if( limit != undefined )
            this.page_size = limit
        this.options = options
        this.url = mk_url( `${sess.rest_base_url_get()}/${this.entity_name}`, args, order )
    }

    public reset() : void {
        console.warn( "RestIter.reset() will be deprecated in json_client_ts 0.2" )
        this.begin_next = 0
    }

    /**
     * Overwrite default page size
     */
    public page_size_set( new_size: number ) {
        console.warn( "RestIter.page_size_set(number) will be deprecated in json_client_ts 0.2" )
        this.page_size = new_size
    }

    public total_count() : number {
        return this.total
    }

    // Fetch the next page of data
    public next() {
        if( this.total != -1 && this.begin_next >= this.total )
            return null

        let begin = this.begin_next
        let end = begin + ( this.page_size - 1 )
        if( this.total > -1 && end > this.total - 1 )
            end = this.total - 1
        this.begin_next = end + 1

        const fn = async () => {
            let res = new Array<Data>()

            let h = this.sess.headers_get()
            h.append('Range', `items=${begin}-${end}` )

            let response = await fetch( this.url, {
                method: 'GET',
                credentials: 'same-origin',
                cache: 'no-store',
                headers: h
            })

            await FetchResponse( this.sess, response )

            let total = -1
            if( response.headers.has( 'Content-Range' )) {
                let range = response.headers.get('Content-Range')

                if (typeof range == 'string') {
                    let res = items_reg.exec( range )

                    if( res ) {
                        // let start = parseInt( res[ 1 ] )
                        end = parseInt( res[ 2 ] )
                        total = -1

                        if( res.length == 4 && res[ 3 ].length > 0 ) {
                            total = parseInt( res[ 3 ] )
                            this.total = total
                        }
                    }
                }
            }
                                                                   
            for( let d of await FetchAsJson( response ))
                if( this.nfn )
                    res.push( this.nfn( d ))
        
            return res            
        }

        return fn()
    }

}

export interface Options {
    http_errors: boolean
}

/**
 * Define a rest entity store, that can handle normal RESTful json ations, and a query
 * that handle paged loading for large result set
 */

export class RestEntityBase<Data, ArgsT> implements Entity<number, Data, ArgsT> {
    private entity_name: string
    private key_name = 'id'
    private sess: Session
    private options: Options

    constructor( sess: Session, entity_name: string, options?: Options ) {
        this.entity_name = entity_name

        this.sess = sess
        if(options != undefined) {
            this.options = options
        } else {
            this.options = { http_errors: sess.http_errors }
        }
    }

    // Make needed type conversions and default data
    protected normalize( v: any ) : Data {
        return v
    }

    // Convert the normalized to the raw format given by server on storing data
    protected de_normalize( d: Data ) : any {
        return d
    }

    private url_get( key?: any ) : string {
        let url = `${this.sess.rest_base_url_get()}/${this.entity_name}`

        if( key )
            url += `/${key}`

        return url
    }

    public key( data: Data ) : number {
        return data[ this.key_name ]
    }

    public async get( key: number ) {
        let res = await fetch( this.url_get( key ), {
            method: 'GET',
            credentials: 'same-origin',
            cache: 'no-store',
            headers: this.sess.headers_get()
        })

        await FetchResponse( this.sess, res )
    
        return this.normalize( await FetchAsJson( res ) )   
    }

    public async set( key: number, data: Data ) {
        let res = await fetch( this.url_get( key ), {
            method: 'PUT',
            credentials: 'same-origin',
            cache: 'no-store',
            body: JSON.stringify( this.de_normalize( data )),
            headers: this.sess.headers_get()
        })

        await FetchResponse( this.sess, res )

        return await FetchAsJson( res ) as boolean
    }

    public async create( data: Data ) {
        let res = await fetch( this.url_get(), {
            method: 'POST',
            credentials: 'same-origin',
            cache: 'no-store',
            body: JSON.stringify( this.de_normalize( data )),
            headers: this.sess.headers_get()
        })

        await FetchResponse( this.sess, res )
        
        return this.normalize(await FetchAsJson( res ))
    }

    public async remove( key: number ) {
        let res = await fetch( this.url_get( key ), {
            method: 'DELETE',
            credentials: 'same-origin',
            cache: 'no-store',
            headers: this.sess.headers_get()
        })

        await FetchResponse( this.sess, res )
        
        return await FetchAsJson( res ) as boolean
    }

    public watch( cb: WatchCallback<Data> ) {
        // Nothing yet
    }

    public query( args: ArgsT, order?: string[], offset?: number, limit?: number) : Iter<Data> {
        return new RestIter<Data>( this.sess, this.entity_name, args, this.options, order, offset, limit, this.normalize)
    }
}
