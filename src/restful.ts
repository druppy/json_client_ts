import {Iter, Entity, WatchCallback} from './store'
import {rest_base_url_get, headers_get} from './common'

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

        if( value ) {
            if( typeof value != 'string' )
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
    private entity_name: string
    private args: any
    private nfn: NormalizeFn<Data>

    private url: string

    constructor( entity_name: string, args: Object, order: string[], nfn: NormalizeFn<Data> ) {
        this.entity_name = entity_name
        this.args = args
        this.nfn = nfn
        // need order too !!!
        this.url = mk_url( `${rest_base_url_get()}/${this.entity_name}`, args, order )
        this.reset()
    }

    public reset() : void {
        this.begin_next = 0
    }

    public total_count() : number {
        return this.total
    }

    // Fetch the next page of data
    public next() : Promise<Array<Data>> {
        if( this.total != -1 && this.begin_next >= this.total )
            return null

        let begin = this.begin_next
        let end = begin + rest_page_size
        this.begin_next = end

        return new Promise<Array<Data>>((resolve, reject) => {
            // fetch buffer if none has been found before
            let key = `${begin}-${end}`

            let p = new Promise<any>(( resolve, reject ) => {
                let h = headers_get()
                h.append('Range', `items=${begin}-${end}` )

                fetch( this.url, {
                    method: 'GET',
                    credentials: 'same-origin',
                    cache: 'no-store',
                    headers: h
                }).then((response) => {
                    let start = 0, end = 0, total = -1

                    if( response.headers.has( 'Content-Range' )) {
                        let res = items_reg.exec( response.headers.get( 'Content-Range' ))

                        if( res ) {
                            start = parseInt( res[ 1 ] )
                            end = parseInt( res[ 2 ] )
                            total = -1

                            if( res.length == 4 && res[ 3 ].length > 0 ) {
                                total = parseInt( res[ 3 ] )
                                this.total = total
                            }
                        }
                    }

                    response.json().then( jdata => {
                        resolve(jdata)
                    })
                })
            })

            p.then( data => {
                let res = new Array<Data>()

                for( let d of data )
                    res.push( this.nfn( d ))

                resolve( res )
            })
        })
    }
}

/**
 * Define a rest entity store, that can handle normal RESTful json ations, and a query
 * that handle paged loading for large result set
 */

export class RestEntity<Data, ArgsT> implements Entity<number, Data, ArgsT> {
    private entity_name: string
    private key_name = 'id'

    constructor( entity_name: string ) {
        this.entity_name = entity_name
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
        let url = `${rest_base_url_get()}/${this.entity_name}`

        if( key )
            url += `/${key}`

        return url
    }

    public key( data: Data ) : number {
        return data[ this.key_name ]
    }

    public get( key: number ) : Promise<Data> {
        return new Promise<Data>((resolve, reject) => {
            fetch( this.url_get( key ), {
                method: 'GET',
                credentials: 'same-origin',
                cache: 'no-store',
                headers: headers_get()
            }).then((res) => {
                res.json().then(jdata => {
                    resolve( this.normalize( jdata ))
                })
            }).catch( err => {
                //console.error( 'Restful GET error', err );
            })
        })
    }

    public set( key: number, data: Data ) : void {
        fetch( this.url_get( key ), {
            method: 'PUT',
            credentials: 'same-origin',
            cache: 'no-store',
            body: JSON.stringify( this.de_normalize( data )),
            headers: headers_get()
        }).catch( err => {
            //console.error( 'Restful PUT error', err );
        })
    }

    public create( data: Data ) : Promise<Data> {
        return new Promise<Data>((resolve, reject) => {
            fetch( this.url_get(), {
                method: 'POST',
                credentials: 'same-origin',
                cache: 'no-store',
                body: JSON.stringify( data ),
                headers: headers_get()
            }).then((res) => {
                res.json().then(jdata => {
                    resolve( this.normalize( jdata ))
                })
            }).catch( err => {
                //console.error( 'Restful POST error', err );
            })
        })
    }

    public remove( key: number ) : void {
        fetch( this.url_get( key ), {
            method: 'DELETE',
            credentials: 'same-origin',
            cache: 'no-store',
            headers: headers_get()
        }).catch( err => {
            //console.error( 'Restful DELETE error', err );
        })
    }

    public watch( cb: WatchCallback<Data> ) {
        // Nothing yet
    }

    public query( args: ArgsT, order?: string[] ) : Iter<Data> {
        return new RestIter<Data>( this.entity_name, args, order, this.normalize )
    }
}