//phantomjs module
var proc = require("child_process");
var sys = require("system");
var fs = require('fs');
var page = require("webpage").create();

var _util = require('util_debounce_throttle')

phantom.onError = assertError
function assertError (msg, stack){
	console.log('phantom onerror:', msg)
	if( !/AssertionError/.test(msg) )return
	console.log(msg, '\n'+ stack.map(function(v){ return 'Line '+ v.line+' '+ (v.function?'['+v.function+'] ':'') +v.file }).join('\n') )
	phantom.exit(1)
}

var WHICH_MOUSE_BUTTON = {"0":"", "1":"left", "2":"middle", "3":"right"}

page.zoomFactor = 1;
//page.clipRect = { top: 10, left: 0, width: 640, height: 490 };
page.viewportSize = { width: 1000, height: 610 }
page.settings.userAgent = 'Mozilla/5.0 (Windows NT 5.1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/31.0.1650.57 Safari/537.36'
page.settings.resourceTimeout = 50000; // 5 seconds
page.settings.localToRemoteUrlAccessEnabled = true
page.settings.webSecurityEnabled = false
page.customHeaders = {
	"Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
	"Pragma": "no-cache",
	"Connection": "keep-alive",
}

console.log('phantom started')

ws= new WebSocket('ws://localhost:1280');
ws.onopen = function (e) {

	console.log('phantom connected to ws')

	ws.onmessage = function (message) {

	    var msg; try{ msg=JSON.parse(message.data) }catch(e){ msg=message.data }

	    switch(msg.type){

	      case 'broadcast':
	        if(msg.meta=='clientList'&&msg.data.indexOf('client')>-1 ) init();


	        break

	      case 'window_resize':
	      case 'window_scroll':
	        page.scrollPosition = {
			  top: msg.data.scrollY,
			  left: msg.data.scrollX
			}
			page.viewportSize = { width: msg.data.width, height: msg.data.height }
			// console.log( JSON.stringify( msg.data ) )

	        break

	      // command from client.html
	      case 'command':
	          try{
	            msg.result = eval( msg.data )
	          }catch(e){
	            msg.result = e.stack
	          }
	          delete msg.data
	          msg.type = 'command_result'
	          ws._send( msg )

	      	break

	      // get callback from ws._call
		  case 'command_result':
			if(msg.__id){
				var cb = WS_CALLBACK[msg.__id]
				delete WS_CALLBACK[msg.__id]
				cb && cb(msg)
			}

          	break
	      case 'event_mouse':
	      	var e = msg.data
	      	// console.log(e.type, e.pageX, e.pageY, e.which)
	      	e.type = e.type.replace('dbl', 'double')
	      	if( /click|down|up/.test(e.type) ) page.sendEvent('mousemove', e.pageX, e.pageY, WHICH_MOUSE_BUTTON[e.which] );
	      	page.sendEvent(e.type, e.pageX, e.pageY, WHICH_MOUSE_BUTTON[e.which] )

	      	break
	      default:
	        
	        break
	    }
	}
	ws.onclose = function (code, reason, bClean) {
		console.log("ws error: ", code, reason);
	}
	ws._send({type:'connection', meta:'server', name:'phantom'})
}
var WS_CALLBACK = {}
ws._send = function(msg){
	if(ws.readyState!=1) return
	ws.send( typeof msg=='string' ? msg : JSON.stringify(msg) )
}
ws._call = function(msg, cb) {
  msg.__id = '_'+Date.now()+Math.random()
  WS_CALLBACK[msg.__id] = cb
  ws._send(msg)
}



page.onError=function(msg, stack){
	ws._send( {type:'console_error', data:{msg:msg,stack:stack} } )
}
page.onConsoleMessage=function(msg){
	ws._send( {type:'console_message', data:msg} )
}

var renderCount = 0
function renderLoop(){
	setTimeout(function(){
		// page.clipRect = {
		//   top: page.scrollPosition.top,
		//   left: page.scrollPosition.left,
		//   width: page.viewportSize.width,
		//   height: page.viewportSize.height
		// }
		var prevPos = page.scrollPosition
		page.scrollPosition = {   top: 0 ,   left: 0 }
		ws._send( {type:'render', data: page.renderBase64('JPEG'), meta:{ count:renderCount++, size:page.viewportSize } } )
		page.scrollPosition = prevPos
		renderLoop()
	}, 100)
}

function createCursor(){
	page.evaluate(function(){
		window._phantom.dot = (function(){
			var dot = document.createElement("div"); 
			dot.style.cssText = 'pointer-events:none; border-radius:100px; background:rgba(255,0,0,0.8); width:10px; height:10px; position:absolute; z-index:9999999999;'
			dot.style.zIndex=Math.pow(2,53); 
			document.body.appendChild(dot);
			return dot
		})()
		window._phantom.setDot = function (x,y){ 
			window._phantom.dot.style.left = x-5 + "px"; 
			window._phantom.dot.style.top = y-5 + "px"; 
		}
	})
}

function init(){
	var url = 'http://1111hui.com/github/m_drag/index.html'
	// url = 'http://bing.com'
	if(page.clearMemoryCache) page.clearMemoryCache();
	page.open(url+ '?'+ Math.random(), function(status){	// success
		createCursor()
		renderLoop()
		page.evaluate(function(){
			window.addEventListener('mousemove', function(evt){
				_phantom.setDot(evt.pageX,evt.pageY)
			})
			window.addEventListener('mouseup', function(evt){
			})
			window.addEventListener('mousedown', function(evt){
				console.log(evt.type, Date.now())
				_phantom.setDot(evt.pageX,evt.pageY)
			})
		})
	})
}
