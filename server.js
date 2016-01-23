var fs=require("fs")
var http=require("http")
var path=require("path")
var spawn=require("child_process").spawn

var HTTP_HOST = '0.0.0.0'
var HTTP_PORT = 8080
var WS_PORT = 1280

var ROUTE = {
	'/'		: 	'/client.html',
}
var MIME = {
	'.js'	:	'application/javascript',
	'.json'	:	'application/json',
	'.css'	:	'text/css',
	'.png'	:	'image/png',
}

// create Http Server
var HttpServer = http.createServer(function(req,res){
	console.log( (new Date).toLocaleString(), req.method, req.url )

	var filePath = req.url
	filePath = '.' + (ROUTE[filePath] || filePath)

	var ext = path.extname(filePath)
	var contentType = MIME[ext] || 'text/html'

	fs.readFile(filePath, function(err, data) {
		if(err){
			res.statusCode=404
			return res.end()
		}
		res.writeHeader(200, {'Content-Type':contentType})
		res.end(data, 'utf8')
	})
})
HttpServer.listen(HTTP_PORT, HTTP_HOST)

console.log('server started at %s:%s', HTTP_HOST, HTTP_PORT )


// create WS Server
var WebSocketServer = require('ws').Server
var wss = new WebSocketServer({ port: WS_PORT })

wss.on('connection', function connection(ws) {

  ws.on('close', function incoming(code, message) {
    console.log("WS close: ", code, message)
  })

  ws.on('message', function incoming(message) {
    // console.log('received: %s', message)
    var msg; try{ msg=JSON.parse(message) }catch(e){ msg=message }
    switch(msg.type){

      case 'connection':
        ws.name = msg.name
        broadcast({ meta:'clientList', data:clientList() })
        break

      // command from client.html or phantom
      case 'command':
        if(msg.meta=='server'){
          try{
            msg.result = eval( msg.data )
          }catch(e){
            msg.result = e.stack
          }
          delete msg.data
          msg.type = 'command_result'
          ws._send( msg )
          return
        }

      default:
        ws.name==='client'? toPhantom(msg) : toClient(msg)
        break

    }
  })

  ws._send = function(msg){
    if(ws.readyState!=1) return
    ws.send( typeof msg=='string' ? msg : JSON.stringify(msg) )
  }

  ws._send( {type:'ws', msg:'connected to socket 8080'} )

})


function clientList(){
  return wss.clients.map((v,i)=>v.name)
}
function findClient(name){
  return wss.clients.find((v,i)=>v.name==name)
}
function toClient(msg){
  var client = findClient('client')
  if(client) client._send(msg)
}
function toPhantom(msg){
  var phantom = findClient('phantom')
  if(phantom) phantom._send(msg)
}

function broadcast(data) {
  wss.clients.forEach(function each(client) {
    data.type='broadcast'
    client._send(data);
  })
}


// Phantom

var ls = spawn("phantomjs", ['--config', 'phantom.config', "ptest.js"], {pwd:__dirname, stdio: "pipe" });

ls.stdout.setEncoding("utf8");
ls.stderr.setEncoding("utf8");
ls.stdout.on("data",function (data) {
	console.log('stdout', data);
})
ls.stderr.on("data",function (data) {
	console.log('stderr', data);
})
ls.on("close", function (code) {
	console.log('close', code)
})
ls.on("error", function (code) {
	console.log('error', code);
})

