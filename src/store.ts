
// We all have to wait for ES6 iterators, in order to use for ... of structure ... sigth ...
export interface Iter<DataT> {
    total_count() : number
    next() : Promise<Array<DataT>>
}


export interface WatchCallback<Data>{
    (key: number, data: Data) : void
}

/**
    Interface for any entity, regardless of protocol
*/
export interface Entity<KeyT, DataT, ArgsT extends Object> {
    key( data: DataT ) : KeyT
    get( key: KeyT ) : Promise<DataT>
    set( key: KeyT, data: DataT ) : void
    create( data: DataT ) : Promise<DataT>
    remove( key: KeyT ) : void

    watch( cb: WatchCallback<DataT> ) : void

    query( args: ArgsT, order?: string[] ) : Iter<DataT>
}
