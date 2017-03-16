export interface LocaleFn {
    (locale:string):void
}

let locale_current: string
let locale_set_fn: LocaleFn

/**
  The provided function will be called once when we discover that the language given from
  the server has changed, and first time we get a locale from the server.
  */ 
export function locale_cb_set( fn: LocaleFn ) {
    locale_set_fn = fn
}

// Will be called when we get a response from backedn
export function locale_check( locale: string ) {
    if( locale_set_fn && locale_current != locale ) {
        locale_set_fn( locale )
        locale_current = locale
    }
}

const service_url = '/service'

export function service_url_get( path?: string ) {
    if( path ) {
        if( path.charAt( 0 ) == '/' )
            return service_url + path

        return service_url + '/' + path
    }
    return service_url
}

export function rpc_url_get() {
    return service_url_get( '/json' )
}

export function rest_base_url_get() { 
    return service_url_get( '/entity' )
}

let service_header = {}

export function header_add( name: string, value: string ) {
    service_header[ name ] = value
}

export function headers_get() : Headers {
    let header = new Headers()

    for( let name in service_header )
        header.append(name, service_header[ name ])

    return header
} 