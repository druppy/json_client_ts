///<amd-module name="json_client_ts"/>
// define how the module will look like
import { Session } from './session'
import { RestEntityBase, Options } from './restful'
import { rpc_sess, rpc_names_sess, fetch_smd_sess, Methods } from './rpc'
import {LocaleFn} from './common'
export {Entity, Iter, WatchCallback} from './store'
export {RestError, RestIter} from './restful'
export {Session} from './session'

// compatibility functions, to emulate old global scope
let global_session = new Session()

// make sure all http errors is handled as rejects (exceptions using await)
export function http_errors_set( use_exceptions: boolean ) {
    global_session.http_errors = use_exceptions
}

export function locale_cb_set(fn: LocaleFn) {
    global_session.locale_cb_set(fn)
}

export function locale_check(locale: string) {
    global_session.locale_check(locale)
}

export function service_url_get(path?: string) {
    return global_session.service_url_get(path)
}

export function rpc_url_get() {
    return global_session.rpc_url_get()
}

export function rest_base_url_get() {
    return global_session.rpc_url_get()
}

export function header_add(name: string, value: string) {
    global_session.header_add(name, value)
}

export function headers_get(): Headers {
    return global_session.headers_get()
}

export function rpc<T extends Object>(method: string, ...args: any[]) {
    return rpc_sess<T>(global_session, method, ...args)
}

export function rpc_names() {
    return rpc_names_sess(global_session)
}

export function fetch_smd() : Promise<Methods> {
    return fetch_smd_sess(global_session)
}

export class RestEntity<Data, ArgsT> extends RestEntityBase<Data, ArgsT> {
    constructor( entity_name: string, options?: Options) {
        super(global_session, entity_name, options)
    }
}
