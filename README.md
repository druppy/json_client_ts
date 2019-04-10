# JSON net client in Typescript

Basic functions for JsonRPC 2.0, and JsonRESTful handling, written in Typescript

It supports :

 * Types safe RPC function return value
 * Typesafe RESTful entity
 * JsonRPC 2.0 including Batch
 * Based on the new ES2015 and the new fetch std
 * NodeJS compatible too

# Example code

This is a simple function the calles a rpc function, and expect the result to be of type any, and put it onside the console. This ofcause and be any interface ... that match what the server provides.

```typescript
import {rpc} from 'json_client_ts'

rpc<any>( 'rpc_fn_name', 42 ).then( r => {
    console.log( 'result', r )
})
``` 

or using async/await that may be more elegant if things need to be connected.

```typescript
import {rpc} from 'json_client_ts'

async function test() {
    console.log( 'async result', await rpc<any>( 'rpc_fn_name', 42 ))
}
```

# Session

Normally when uing a browser only one communication channel is in use, and therefor 
we really only have one client and one session (like cookie store etc).

When using nodejs, we may end up needing to maintain more than one session to multible 
endpoint. If this is needed, this is done by allocating one single session instance per 
endpoint. In reallity, the default action holds its own session, to if more than one is 
needed we just create more than this default one.

# JsonRPC 2.0

## Return types

The function calles are generic functions, that will try to make the returned type as the
given type.

Note that no automatic function conversion is performed, so if any types needs conversion 
it needs to be done before parsing data to the user. 

This small example returns a custom user structure, but the date data in `age` is a string 
in json, not a date class. So here we make a function that return a promise that returnes 
a new user data with `age` converted to a proper type.

```typescript
interface CustomData {
    name string
    age Date
}

function getUserOnId( id: number ) {
    return rpc<CustomData>( 'find_user_on_id', 2 ).then( u => {
        u.age = new Date( <any>u.age )

        return u
    })
}
```

## Batch

Sending more than one RPC call per request, will reduce roundtrips and make it possible 
to pack more than one function into one sigle transaction (if endpoint support this)

# RESTful json 

Restful abstraction, makes it simple to access restful endpoints in a type strong manner, and 
adds paging and type conversion to the types.

The idea is to make a new class based on the `RestEntityBase` giving it both a query args type 
and data type. If any of these needs conversion the functions `normalize` and `de_normalize`
can be used to do that.

# Using NodeJS 

It is possible to user node while using this library, the only thing that need to be included
is a polyfill for `fetch`, as this is the primary communication method used here.