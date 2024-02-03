//! temperature-map-gl.js
//! version : 0.5.0
//! authors : Lefteris Chatzipetrou
//! license : MIT
//! http://chpetrou.net

;(function (global, factory) {
    typeof exports === 'object' && typeof module !== 'undefined' ? module.exports = factory() :
    typeof define === 'function' && define.amd ? define(factory) :
    global.temperature_map_gl = factory()
}(this, (function () { 'use strict';

	var vertex_shader_source = "\
		attribute vec2 position;														\
																						\
		void main(void) {																\
			gl_Position = vec4(position.x*2.0-1.0, position.y*2.0-1.0, 1.0, 1.0);		\
		}																				\
	";

	var computation_fragment_shader_source = "\
		precision highp float;															\
																						\
		uniform float ui;																\
		uniform vec2 xi;																\
		uniform float p;																\
		uniform float dist_factor;														\
		uniform float range_factor;														\
		uniform vec2 screen_size;														\
		void main(void) {																\
			vec2 x = vec2(gl_FragCoord.x/screen_size.x, gl_FragCoord.y/screen_size.y);	\
			float dist = distance(x, xi)/dist_factor;									\
			float wi = 1.0/pow(dist, p);												\
			gl_FragColor = vec4(ui*wi*range_factor, wi*range_factor, 0.0, 1.0);			\
		}																				\
	";

	var draw_fragment_shader_source = "\
		precision highp float;																														\
																																					\
		uniform sampler2D color_map;																													\
		uniform sampler2D computation_texture;																										\
		uniform vec2 screen_size;																													\
		uniform float gamma;																														\
		void main(void) {																															\
			vec4 data = texture2D(computation_texture, vec2(gl_FragCoord.x/screen_size.x, 1.0-gl_FragCoord.y/screen_size.y));						\
			float val = data.x/data.y;																												\
			vec4 color = texture2D(color_map, vec2(val, 0.5));\
			gl_FragColor.rgba = pow(color, vec4(1.0/gamma));																							\
		}																																			\
	";

	function get_shader(gl, source, type){
		if(type == 'fragment'){
			type = gl.FRAGMENT_SHADER;
		}
		else if(type == 'vertex'){
			type = gl.VERTEX_SHADER;
		}
		else {
			return null;
		}

		var shader = gl.createShader(type);
		gl.shaderSource(shader, source);
		gl.compileShader(shader);

		if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {  
			logger.info('An error occurred compiling the shaders: ' + gl.getShaderInfoLog(shader));
			gl.deleteShader(shader);
			return null;  
		}
			
		return shader;
	}

	function get_program(gl, vertex_shader, fragment_shader){
		var program = gl.createProgram();
		gl.attachShader(program, vertex_shader);
		gl.attachShader(program, fragment_shader);
		gl.linkProgram(program);

		if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
			logger.info('Unable to initialize the shader program: ' + gl.getProgramInfoLog(program));
		}

		return program;
	}
	
	var default_options = {
		p: 1,
		canvas: null,
		opacity: 0.85,
		range_factor: 0.00390625,
		gamma: 1.0,
		show_points: false,
		framebuffer_factor: 1,
		image_zindex: 0,
		dist_factor: 1,
		unit: "°C",
		id: "",
		point_text: function(val) {
			var v;
			if(Math.abs(val) < 1)
				v = val.toFixed(2);
			else if(Math.abs(val) < 10)
				v = val.toFixed(1);
			else
				v = Math.round(val);
			return v;
		},
		color_map : [
			[-50, "#cbecff"],
			[-40, "#8998c7"],
			[-32, "#875aa7"],
			[-25, "#821d7c"],
			[-18, "#002258"],
			[-14, "#193b95"],
			[-10, "#124c9f"],
			[ -6, "#0a60a8"],
			[ -2, "#0078b5"],
			[  2, "#33b6c6"],
			[  6, "#5ac8c6"],
			[ 10, "#96dba6"],
			[ 14, "#76db8e"],
			[ 18, "#5ddb7a"],
			[ 22, "#4cdb6d"],
			[ 24, "#8bdb4c"],
			[ 26, "#bedb4c"],
			[ 28, "#eed371"],
			[ 30, "#eec42b"],
			[ 32, "#eea02b"],
			[ 35, "#ee810f"],
			[ 38, "#ee590f"],
			[ 40, "#ff3c1a"],
			[ 43, "#ff3800"],
			[ 47, "#ff1700"],
			[ 50, "#db0000"],
			[ 55, "#ad0000"],
			[ 60, "#6c0000"],
			[ 70, "#380000"],
			[ 80, "#1c0000"],
			[ 90, "#8700ff"],
			[100, "#ff00ed"],
		]
	};
	
	var instance = 0;
	function temperature_map_gl(image_element, options){
		var _options = {};
		for(var k in default_options)
			_options[k] = default_options[k];

		if(typeof options === 'object'){
			for(var k in options)
				_options[k] = options[k];
		}

		this.instance = instance++;

		this.image_element = image_element;
		image_element.style.zIndex = _options.image_zindex;

		var canvas = _options.canvas || document.createElement('canvas');

		canvas.style.position = 'absolute';
		canvas.style.top = '0px';
		canvas.style.left = '0px';
		canvas.style.zIndex = image_element.style.zIndex?''+(Number(image_element.style.zIndex)+1):'10';
		canvas.style.opacity = _options.opacity;
		canvas.style.pointerEvents = 'none';
		canvas.id = _options.id;
		
		if(!_options.canvas) {
			image_element.parentNode.insertBefore(canvas, image_element.nextSibling);
			this.own_canvas = true;
		}
		else
			this.own_canvas = false;
		this.canvas = canvas;
		
		this.context = this.canvas.getContext('webgl') || this.canvas.getContext('experimental-webgl');
		if(!this.context)
			logger.info('Your browser does not support webgl');
		
		if(!this.context || !this.context.getExtension('OES_texture_half_float')){
			logger.info('Your browser does not support float textures');
			this.context = null;
		}
		
		this.ext = this.context?this.context.getExtension('OES_texture_half_float'):{};
		this.color_map = _options.color_map;
		this.color_map_texture = this.generate_color_map_texture(this.color_map);

		this.points = [];
		this.translated_points = [];
		this.square_vertices_buffer = null;
		this.computation_program = null;
		this.draw_program = null;
		this.position_attribute = null;
		this.computation_framebuffer = null;
		this.computation_texture = null;
		
		this.ui_uniform = null;
		this.xi_uniform = null;
		this.c_screen_size_uniform = null;
		this.d_screen_size_uniform = null;
		this.range_factor_uniform = null;
		this.dist_factor_uniform = null;
		
		this.p_uniform = null;
		this.computation_texture_uniform = null;
		this.gamma_uniform = null;
		this.color_map_uniform = null;

		this.point_text = _options.point_text;
		this.p = _options.p;
		this.range_factor = _options.range_factor;
		this.dist_factor = _options.dist_factor;
		this.gamma = _options.gamma;

		this.show_points = _options.show_points;
		this.unit = _options.unit;
		this.framebuffer_factor = _options.framebuffer_factor;
		this.computation_framebuffer_width = 0;
		this.computation_framebuffer_height = 0;
		
		this.init_shaders();
		this.resize(this.image_element.clientWidth, this.image_element.clientHeight);
	}

	temperature_map_gl.prototype.update_options = function(options){
		if(options.p) this.p = options.p;
		if(options.range_factor) this.range_factor = options.range_factor;
		if(options.dist_factor) this.dist_factor = options.dist_factor;
		
		if(typeof options.unit !== 'undefined') this.unit = options.unit;
		if(options.gamma) this.gamma = options.gamma;
		if(options.show_points) this.show_points = options.show_points;
		if(options.color_map) {
			this.context.deleteTexture(this.color_map_texture);
			this.color_map = options.color_map;
			this.color_map_texture = this.generate_color_map_texture(this.color_map);
		}

		this.draw();
	}

	temperature_map_gl.is_supported = function(){
		var canvas = document.createElement('canvas');
		var context = canvas.getContext('webgl');
		return canvas && context && context.getExtension('OES_texture_half_float');
	}

	temperature_map_gl.prototype.set_points = function(points, low_val, high_val, normal_val){
		this.points = points;
		if(!this.context)
			return;

		var translated_points = [];
		if(points.length){
			var min = (typeof low_val !== 'undefined')?Math.min(points[0][2], low_val):points[0][2];
			var max = (typeof high_val !== 'undefined')?Math.max(points[0][2], high_val):points[0][2];
			var avg = (typeof normal_val !== 'undefined')?normal_val:0;
			for(var i=1;i < points.length; ++i){
				var p = [points[i][0], points[i][1], points[i][2]];
				if(p[2] > max)
					max = p[2];
				if(p[2] < min)
					min = p[2];

				if(typeof normal_val === 'undefined')
					avg += p[2]/points.length;
			}	
			var d = max > min?max - min:1;

			var w = this.canvas.width;
			var h = this.canvas.height;
			for(var i=0;i < points.length; ++i){
				var p = [points[i][0], points[i][1], points[i][2]];
				p[0] = p[0]/w;
				p[1] = p[1]/h;

				if(typeof low_val !== 'undefined' && typeof high_val !== 'undefined' && typeof normal_val !== 'undefined')
					p[2] = Math.max(Math.min(1., Math.pow((2*p[2] - low_val - normal_val)/(high_val - low_val),1)), 0.);
				else if(typeof low_val !== 'undefined' && typeof high_val !== 'undefined')
					p[2] = Math.max(Math.min(1., Math.pow((p[2] - low_val)/(high_val - low_val),1)), 0.);
				else
					p[2] = Math.max(Math.min(1., Math.pow((2*p[2] - avg - min)/d,1) + 0.5), 0.);
				

				translated_points.push(p);
			}
		}
		this.translated_points = translated_points;
	}


	temperature_map_gl.prototype.init_buffers = function() {
		if(!this.context)
			return;

		var gl = this.context;
		this.square_vertices_buffer = gl.createBuffer();
		gl.bindBuffer(gl.ARRAY_BUFFER, this.square_vertices_buffer);
		
		var vertices = [
			1.0,  1.0,
			-1.0, 1.0,
			1.0,  -1.0,
			-1.0, -1.0
		];
		
		gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STATIC_DRAW);

		this.computation_framebuffer_width = Math.ceil(this.canvas.width*this.framebuffer_factor);
		this.computation_framebuffer_height = Math.ceil(this.canvas.height*this.framebuffer_factor);

		this.computation_texture = gl.createTexture();
		gl.bindTexture(gl.TEXTURE_2D, this.computation_texture);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);

		gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, this.computation_framebuffer_width, this.computation_framebuffer_height, 0, gl.RGBA, this.ext.HALF_FLOAT_OES, null);
		
		this.computation_framebuffer = gl.createFramebuffer();
		gl.bindFramebuffer(gl.FRAMEBUFFER, this.computation_framebuffer);
		gl.viewport(0, 0, this.computation_framebuffer_width, this.computation_framebuffer_height);
		gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.computation_texture, 0);

		gl.bindTexture(gl.TEXTURE_2D, null);
		gl.bindFramebuffer(gl.FRAMEBUFFER, null);
	}


	temperature_map_gl.prototype.init_shaders = function(){
		if(!this.context)
			return;

		var gl = this.context;
		var vertex_shader = get_shader(gl, vertex_shader_source, 'vertex');
		var computation_fragment_shader = get_shader(gl, computation_fragment_shader_source, 'fragment');
		var draw_fragment_shader = get_shader(gl, draw_fragment_shader_source, 'fragment');

		this.computation_program = get_program(gl, vertex_shader, computation_fragment_shader);
		this.position_attribute = gl.getAttribLocation(this.computation_program, 'position');
		this.ui_uniform = gl.getUniformLocation(this.computation_program, "ui");
		this.xi_uniform = gl.getUniformLocation(this.computation_program, "xi");
		this.c_screen_size_uniform = gl.getUniformLocation(this.computation_program, "screen_size");
		this.range_factor_uniform = gl.getUniformLocation(this.computation_program, "range_factor");
		this.dist_factor_uniform = gl.getUniformLocation(this.computation_program, "dist_factor");
		
		this.p_uniform = gl.getUniformLocation(this.computation_program, "p");
		gl.enableVertexAttribArray(this.position_attribute);

		this.draw_program = get_program(gl, vertex_shader, draw_fragment_shader);
		this.d_screen_size_uniform = gl.getUniformLocation(this.draw_program, "screen_size");
		this.computation_texture_uniform = gl.getUniformLocation(this.draw_program, 'computation_texture');
		this.gamma_uniform = gl.getUniformLocation(this.draw_program, 'gamma');
		this.color_map_uniform = gl.getUniformLocation(this.computation_program, "color_map");
	}


	temperature_map_gl.prototype.draw = function(){
		if(!this.context)
			return;

		var gl = this.context;
		
		gl.disable(gl.DEPTH_TEST);
		
		gl.enable(gl.BLEND);
		gl.blendEquation(gl.FUNC_ADD);
		gl.blendFunc(gl.ONE, gl.ONE);
		
		gl.clearColor(0.0, 0.0, 0.0, 1.0);

		gl.useProgram(this.computation_program);
		gl.uniform2f(this.c_screen_size_uniform, this.computation_framebuffer_width, this.computation_framebuffer_height);
		gl.uniform1f(this.p_uniform, this.p);
		gl.uniform1f(this.range_factor_uniform, this.range_factor);
		gl.uniform1f(this.dist_factor_uniform, this.dist_factor);
		gl.bindFramebuffer(gl.FRAMEBUFFER, this.computation_framebuffer);
		gl.viewport(0, 0, this.computation_framebuffer_width, this.computation_framebuffer_height);
		gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
		
		for(var i=0; i < this.translated_points.length; ++i){
			var p = this.translated_points[i];
			gl.uniform2f(this.xi_uniform, p[0], p[1]);
			gl.uniform1f(this.ui_uniform, p[2]);

			gl.bindBuffer(gl.ARRAY_BUFFER, this.square_vertices_buffer);
			gl.vertexAttribPointer(this.position_attribute, 2, gl.FLOAT, false, 0, 0);
			gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
		}
		
		
		gl.bindFramebuffer(gl.FRAMEBUFFER, null);
		gl.clearColor(0.0, 0.0, 0.0, 1.0);
		gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

		gl.useProgram(this.draw_program);
		
		gl.uniform1i(this.color_map_uniform, 1);
		gl.activeTexture(gl.TEXTURE0);
		gl.bindTexture(gl.TEXTURE_2D, this.color_map_texture);
		
		gl.uniform1i(this.computation_texture_uniform, 1);
		gl.activeTexture(gl.TEXTURE1);
		gl.bindTexture(gl.TEXTURE_2D, this.computation_texture);

		gl.uniform1f(this.gamma_uniform, this.gamma);
		gl.uniform2f(this.d_screen_size_uniform, this.canvas.width, this.canvas.height);
		gl.viewport(0, 0, this.canvas.width, this.canvas.height);
		gl.bindBuffer(gl.ARRAY_BUFFER, this.square_vertices_buffer);
		gl.vertexAttribPointer(this.position_attribute, 2, gl.FLOAT, false, 0, 0);

		gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

		if(this.show_points)
			this.draw_points();
		else
			this.hide_points();
	}
	
	temperature_map_gl.prototype.hide_points = function(){
		var elements = document.getElementsByClassName('tmg-point-'+this.instance);
		while(elements[0]) {
    		elements[0].parentNode.removeChild(elements[0]);
		}
	}

	temperature_map_gl.prototype.draw_points = function(){
		this.hide_points();

		for(var i=0; i < this.points.length; ++i){
			var p = this.points[i];
			var dot = document.createElement('p');
			dot.style.position = 'absolute';
			dot.style.zIndex = ''+(Number(this.canvas.style.zIndex)+1);
			dot.className = 'tmg-point '+'tmg-point-'+this.instance;
			dot.innerHTML = "<span class='tmg-point-value'>"+this.point_text(p[2])+"</span><span class='tmg-point-unit'>"+this.unit+"</span>";
			this.canvas.parentNode.insertBefore(dot, this.canvas.nextSibling);
			dot.style.left = (p[0]-dot.clientWidth/2) +'px';
			dot.style.top = (p[1]-dot.clientHeight/2) +'px';
		}
	}


	temperature_map_gl.prototype.resize = function(width, height){
		this.canvas.height = height;
		this.canvas.width = width;
		this.canvas.style.height = this.canvas.height+'px';
		this.canvas.style.width = this.canvas.width+'px';
		this.init_buffers();
	}


	temperature_map_gl.prototype.destroy = function(){
		if(this.own_canvas)
			this.canvas.parentNode.removeChild(this.canvas);
		this.hide_points();
	}


	function celsius_to_rgb(c, temperature_map) {
		for(var i=0; i < temperature_map.length; ++i){
			var max_temp = Number(temperature_map[i][0]);
			var color = temperature_map[i][1];
			if(c <= max_temp)
				return color;
		}
		return temperature_map[temperature_map.length-1][1];
	}

	function hex_to_rgb(hex) {
		var shorthandRegex = /^#?([a-f\d])([a-f\d])([a-f\d])$/i;
		hex = hex.replace(shorthandRegex, function(m, r, g, b) {
			return r + r + g + g + b + b;
		});
	
		var result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
		return result ? {
			r: parseInt(result[1], 16),
			g: parseInt(result[2], 16),
			b: parseInt(result[3], 16)
		} : null;
	}
	

	temperature_map_gl.prototype.generate_color_map_texture = function(color_map){
		if(!this.context)
			return;

		var gl = this.context;
		var sample_size = 128;
		var ret = [];
		var a = color_map[0][0];
		var b = color_map[color_map.length-1][0];
		for(var i=0; i < sample_size; ++i){
			var c = a + (b-a)*i/sample_size;
			var color = hex_to_rgb(celsius_to_rgb(c, color_map));
			ret.push(color.r);
			ret.push(color.g);
			ret.push(color.b);
			ret.push(1);
		}

		var tex = gl.createTexture();
		gl.bindTexture(gl.TEXTURE_2D, tex);

		var oneDTextureTexels = new Uint8Array(ret);
		var width = ret.length/4;
		var height = 1;
		gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, oneDTextureTexels);

		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

		return tex;
	}

	return temperature_map_gl;
})));