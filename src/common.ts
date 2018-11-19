
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

