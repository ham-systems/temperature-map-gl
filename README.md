Minimalist Library to draw temperature maps (heat maps) using WebGL in pure Javascript. Except a O(N) pre-process step which is done in Javascipt, all calculations and drawing are done with shaders in WebGL, so it is pretty fast. It is also very small (~3kB minified and gzipped)

'OES_texture_float' extension is required.

### Using the library

#### HTML
```html
...
<script type='text/javascript' src='temperature-map-gl.min.js'></script>
...
<div class='map-container' style='position:relative;'>
	<img id='map-image0' src='symi.png'/>
</div>
```

#### Javascript
```js
var image = document.getElementById("map-image0");
var temperature_map = new temperature_map_gl(image);
temperature_map.set_points(points);
temperature_map.draw();
```

points are in this format:
```js
var points = [
	[x0,y0,v0],
	[x1,y1,v1],
	...
	[xN,yN,vN]
]
```

#### Available options (the defaults are shown)
```js
var temperature_map = new temperature_map_gl(image), {
	p: 3, // used in calculating the IDW values, see wikipedia article mentioned at the bottom of this
	canvas: null, //use this canvas element and don't create a new one
	opacity: 0.5,// opacity of the canvas
	range_factor: 0.00390625,//used in scaling the values so they don't clip when storing them as channels of the framebuffer texture
	gamma: 2.2,//used in altering the color during draw pass
	brightness: 0.00,//used in brightening the color during draw pass
	show_points: false,//add 
	framebuffer_factor: 1.0,//the ratio of the dimensions of the calculation framebuffer in relation to the actual canvas
	image_zindex: 0,//style z-index given to the image
	point_text: function(val) {//used when the show_points is true of the draw_points() method is called explicitly. It returns the text on the points shown for given value val
		var v;
		if(val < 1)
			v = val.toFixed(2);
		else if(val < 10)
			v = val.toFixed(1);
		else
			v = Math.round(val);
		return v + "°C";
	}
};
```

### Methods

```js
//constructor
temperature_map_gl(image_element[, options]);

//update some options, not all constructor options will have an effect..
temperature_map.update_options(options);

//sets points in the format mentioned above
//the optional arguments determine what is min = blue, what is max = red, normal = green
temperature_map.set_points(points[, min, max, normal_val]);

//performs a calculation and draw given the points set
temperature_map.draw();

//explicitly draw markers on points, like using the show_points option
temperature_map.draw_points()

//explicitly hide markers
temperature_map.hide_points();

//resize canvas
temperature_map.resize(width, height);

//removes all created elements
temperature_map.destroy();

//returns if all the requirements are met (webgl and OES_texture_float), if this returns false, draws are no-ops
is_supported();
```

### Examples

You can check it out live at [chpetrou.net](http://chpetrou.net/temperature-map-js/)

### Technical explanation

Values are calculated using 'Inverse Distance Weighting (IDW)' algorithm:

[Wikipedia - Inverse Distance Weighting](https://en.wikipedia.org/wiki/Inverse_distance_weighting)

The rest of the explanation makes sense only in the context of the wikipedia article above...

For every point, we perform a render pass to a texture. Using IDW, we calculate the point "influence" to every fragment using a fragment shader. We store the ui*wi at the r channel of the texture and w_i at the g channel. Using blending with "accumulator" configuration, we end end up with a texture, where we have the top sum of IDW in r channel, and the bottom sum at the g channel. Since channels WebGL are clamped in [0,1], we multiply both channels with range_factor to avoid clamping.

At last, we perform a last pass where we get the IDW value by reading the calculation texture and do a r/g at every fragment. We then use this value to determine the color of the fragment. 

More on the technical side on [my website](http://chpetrou.net/en/temperature-map-gl-js-minimalist-pure-javascript-heat-map-library-using-webgl-shaders/)

Used on [HAM Systems IoT platform](https://hamsystems.eu) for heatmaps over floorplans for visualization
