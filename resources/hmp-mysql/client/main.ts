// The Framework currently applies one resource-dependency graph on both server and client.
// hmp-mysql has no client API, but this entry keeps it present so client-bearing dependents
// can satisfy the same manifest graph.
console.info("[hmp-mysql] client dependency shim ready");
