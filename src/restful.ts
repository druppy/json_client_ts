import {Iter, Entity, WatchCallback} from './store'
import {Session} from './session'

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
    private page_size = rest_page_size
    private entity_name: string
    private args: any
    private nfn?: NormalizeFn<Data>
    private sess: Session

    private url: string

    constructor( sess: Session, entity_name: string, args: Object, order?: string[], nfn?: NormalizeFn<Data> ) {
        this.sess = sess
        this.entity_name = entity_name
        this.args = args
        if( nfn != undefined )
            this.nfn = nfn
        // need order too !!!
        this.url = mk_url( `${sess.rest_base_url_get()}/${this.entity_name}`, args, order )
        this.reset()
    }

    public reset() : void {
        this.begin_next = 0
    }

    /**
     * Overwrite default page size
     */
    public page_size_set( new_size: number ) {
        this.page_size = new_size
    }

    public total_count() : number {
        return this.total
    }

    // Fetch the next page of data
    public next() : Promise<Array<Data>>|null {
        if( this.total != -1 && this.begin_next >= this.total )
            return null

        let begin = this.begin_next
        let end = begin + this.page_size
        if( this.total > -1 && end > this.total )
            end = this.total
        this.begin_next = end + 1

        return new Promise<Array<Data>>((resolve, reject) => {
            // fetch buffer if none has been found before
            let key = `${begin}-${end}`

            let p = new Promise<any>(( resolve, reject ) => {
                let h = this.sess.headers_get()
                h.append('Range', `items=${begin}-${end}` )

                fetch( this.url, {
                    method: 'GET',
                    credentials: 'same-origin',
                    cache: 'no-store',
                    headers: h
                }).then((response) => {
                    let start = 0, end = 0, total = -1

                    if( response.headers.has( 'Content-Range' )) {
                        let range = response.headers.get('Content-Range')

                        if (typeof range == 'string') {
                            let res = items_reg.exec( range )

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
                    }

                    response.json().then( jdata => {
                        resolve(jdata)
                    })
                }).catch( err => {
                    reject( err )
                })
            })

            p.then( data => {
                let res = new Array<Data>()

                for( let d of data )
                    if( this.nfn )
                        res.push( this.nfn( d ))

                resolve( res )
            })
        })
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
        this.options = options
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

    public get( key: number ) : Promise<Data> {
        return new Promise<Data>((resolve, reject) => {
            fetch( this.url_get( key ), {
                method: 'GET',
                credentials: 'same-origin',
                cache: 'no-store',
                headers: this.sess.headers_get()
            }).then((res) => {
                if( this.options && this.options.http_errors && !res.ok) {
                    reject( new Error( "HTTP error: " + res.statusText ))
                } else {
                    res.json().then(jdata => {
                        resolve( this.normalize( jdata ))
                    })
                }
            }).catch( err => {
                console.error( 'Restful GET error', err );
                reject( err )
            })
        })
    }

    public set( key: number, data: Data ) : Promise<boolean> {
        return new Promise<boolean>((resolve, reject) => {
            fetch( this.url_get( key ), {
                method: 'PUT',
                credentials: 'same-origin',
                cache: 'no-store',
                body: JSON.stringify( this.de_normalize( data )),
                headers: this.sess.headers_get()
            }).then(res => {
                if( this.options && this.options.http_errors && !res.ok) {
                    reject( new Error( "HTTP error: " + res.statusText ))
                } else {
                    res.json().then(jdata => {
                        resolve( jdata )
                    })
                }
            }).catch( err => {
                // console.error( 'Restful PUT error', err )
                reject( err )
            })
        })
    }

    public create( data: Data ) : Promise<Data> {
        return new Promise<Data>((resolve, reject) => {
            fetch( this.url_get(), {
                method: 'POST',
                credentials: 'same-origin',
                cache: 'no-store',
                body: JSON.stringify( this.de_normalize( data )),
                headers: this.sess.headers_get()
            }).then((res) => {
                if( this.options && this.options.http_errors && !res.ok) {
                    reject( new Error( "HTTP error: " + res.statusText ))
                } else {
                    res.json().then(jdata => {
                        resolve( this.normalize( jdata ))
                    })
                }
            }).catch( err => {
                // console.error( 'Restful POST error', err );
                reject( err )
            })
        })
    }

    public remove( key: number ) : Promise<boolean> {
        return new Promise<boolean>((resolve, reject) => {
            fetch( this.url_get( key ), {
                method: 'DELETE',
                credentials: 'same-origin',
                cache: 'no-store',
                headers: this.sess.headers_get()
            }).then( res => {
                if( this.options && this.options.http_errors && !res.ok) {
                    reject( new Error( "HTTP error: " + res.statusText ))
                } else {
                    res.json().then(jdata => {
                        resolve( jdata )
                    })
                }
            }).catch( err => {
                // console.error( 'Restful DELETE error', err );
                reject( err )
            })
        })
    }

    public watch( cb: WatchCallback<Data> ) {
        // Nothing yet
    }

    public query( args: ArgsT, order?: string[] ) : Iter<Data> {
        return new RestIter<Data>( this.sess, this.entity_name, args, order, this.normalize )
    }
}
