import { rpc_sess, rpc_names_sess, fetch_smd_sess} from './rpc'
import { RestEntityBase } from './restful';
import { LocaleFn } from './common'

export class Session {
    service_url = '/service'
    service_header: { [i: string]: string } = {}
    locale_set_fn?: LocaleFn 
    locale_current = ''

    /**
     The provided function will be called once when we discover that the language given from
    the server has changed, and first time we get a locale from the server.
    */
    locale_cb_set(fn: LocaleFn) {
        this.locale_set_fn = fn
    }

    // Will be called when we get a response from backedn
    locale_check(locale: string) {
        if (this.locale_set_fn && this.locale_current != locale) {
            this.locale_set_fn(locale)
            this.locale_current = locale
        }
    }

    service_url_set( url: string ) {
        this.service_url = url
    }

    service_url_get(path?: string): string {
        if (path) {
            if (path.charAt(0) == '/')
                return this.service_url + path

            return this.service_url + '/' + path
        }
        return this.service_url
    }

    rpc_url_get(): string {
        return this.service_url_get('/json')
    }

    rest_base_url_get(): string {
        return this.service_url_get('/entity')
    }

    header_add(name: string, value: string) {
        this.service_header[name] = value
    }

    headers_get(): Headers {
        let header = new Headers()

        for (let name in this.service_header)
            header.append(name, this.service_header[name])

        return header
    }

    getEntity<Data, ArgsT>( name: string ) {
        return new RestEntityBase<Data, ArgsT>( this, name )
    }

    rpc<T extends Object>(method: string, ...args: any[]): Promise<T> {
        return rpc_sess<T>(this, method, ...args)
    }

    fetch_smd() {
        return fetch_smd_sess( this )
    }

    rpc_names() {
        return rpc_names_sess( this )
    }
}
