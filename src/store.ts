
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

export interface UpdateDataRow<DataT> {
    state: 'create'|'delete'|'update'|'clean'
    data: DataT
}

export interface UpdatedDataIter<DataT> {
    next() : {value?: DataT, done?: boolean}
}

// implements a real JS iterable
class UpdateIterator<KeyT, DataT> implements UpdatedDataIter<DataT> {
    private iter: IterableIterator<UpdateDataRow<DataT>>

    constructor( buffer: Map<KeyT, UpdateDataRow<DataT>>) {
        this.iter = buffer.values()
    }

    next() : {value?: DataT, done?: boolean} {
        let cur = this.iter.next()

        if( cur.done ) 
            return {done: true}

        if( cur.value.state != 'clean' )
            return {value: cur.value.data, done: false}
    }
}

/** 
    This is a spacial entity that can handle updates and store these in memory, in order to 
    store the result at a later time.
*/
export class UpdateEntity<KeyT, DataT, ArgsT extends Object> implements Entity<KeyT, DataT, ArgsT> {
    private entity: Entity <KeyT, DataT, ArgsT> = null
    private buffer: Map<KeyT, UpdateDataRow<DataT>> = new Map<KeyT, UpdateDataRow<DataT>>()

    SaveBufferEntity( entity: Entity<KeyT, DataT, ArgsT> ) {
        this.entity = entity
    }

    key( data: DataT ) : KeyT {
        return this.entity.key( data )
    }

    get( key: KeyT ) : Promise<DataT> {
        if( this.buffer.has( key )) {
            return new Promise<DataT>((resolve, reject) => {
                let row = this.buffer.get( key )

                if( row.state != 'delete' )
                    resolve( row.data )
                else
                    reject( `Can't get deleted row in SaveBufferEntity` )
            })
        } 

        let p = this.entity.get( key )
        
        // Add it to the buffer too
        p.then((data) => {
            this.buffer.set( key, {
                data: data,
                state: 'clean'
            })
        })

        return p
    }

    set( key: KeyT, data: DataT ) : void {
        if( this.buffer.has( key ))
            this.buffer.get( key ).data = data
        else
            this.buffer.set( key, {
                state: 'update',
                data: data 
            })
    }

    create( data: DataT ) : Promise<DataT> {
        return new Promise<DataT>((resolve, reject) => {
            let key = this.key( data )
            if( this.buffer.has( key )) {
                reject( `data row already exists` )
            } else {
                this.buffer.set( key, {
                    state: 'create',
                    data: data 
                })

                resolve( data )
            }
        })
    }

    remove( key: KeyT ) : void {
        if( this.buffer.has( key )) {
            this.buffer.get( key ).state = 'delete'
        }
    }

    watch( cb: WatchCallback<DataT> ) : void {}

    query( args: ArgsT, order?: string[] ) : Iter<DataT> {
        return this.entity.query( args, order )
    }

    updated_date() : UpdatedDataIter<DataT> {
        return new UpdateIterator<KeyT, DataT>( this.buffer )
    }

    reset() {
        this.buffer.clear()
    }
}