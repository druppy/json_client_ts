# JSON net client in Typescript

Basic functions for JsonRPC 2.0, and JsonRESTful handling, written in Typescript

It supports :

 * Types safe RPC function return value
 * Typesafe RESTful entity
 * JsonRPC 2.0 including Batch
 * Based on the new ES2015 and the new fetch std

# Example code

This is a simple function the calles a rpc function, and expect the result to be of type any, and put it onside the console. This ofcause and be any interface ... that match what the server provides.

```typescript
import {rpc} from 'json_clinet_ts'

rpc<any>( 'rpc_fn_name', 42 ).then( r => {
    console.log( 'result', r )
})
``` 

or using async/await that may be more elegant if things need to be connected.

```typescript
import {rpc} from 'json_clinet_ts'

async function test() {
    console.log( 'async result', await rpc<any>( 'rpc_fn_name', 42 ))
}
```