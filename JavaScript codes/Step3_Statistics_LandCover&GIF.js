// LOAD DATA
// Load the geometry from step 1
var geometry = ee.FeatureCollection('users/danielp/S1BAM_selected_geometry_olympia');
 
// Load the result from step 2
var result = ee.Image('users/danielp/0_FINAL_results_Olympia');


// SET THE PARAMETERS
// Video Settings - frames per seconds
var framesPerSecond = 1;

var limit = 6; // set 100 if you do not want limit your images
// athens1 = 3; athens2 = 4; evia = 5; olympia = 6

// for which image to prepare the land cover analysis [integer]
// The possible range is [0, 'limit'-1]. Value -1 stands for the last image.
var selected_for_land_cover = -1;

// sometimes the burned area could be assigned with 1 [possible values are 0 or 1]
var burned_value = 0;


// ******************************************************
// ****************** Do statistics *********************
// ******************************************************
Map.centerObject(geometry,11);
geometry = geometry.first().geometry();

// call and apply the prepared function to create ImageCollection from bands
var theFunction = require('users/danielp/functions:bandsToImgCollection');
var imageCollection = theFunction.bandsToImgCollection(result);

// create Image statistics
function ImageStats (collection,ROI,value) {
  
  var ImagesWithStats = collection.limit(limit).map(function (image){
    var burned = image.eq(value)
 
    var area = burned.multiply(ee.Image.pixelArea())
    var calculatedArea = area.reduceRegion({
      reducer: ee.Reducer.sum(),
      geometry: ROI,
      scale: 20,
      maxPixels: 1e16
      });
      
    var burnedAreaHa = ee.Number(
      calculatedArea.get(calculatedArea.keys().get(0))).divide(10000).round();
    
    return image.set({'area_in_ha':burnedAreaHa, 
                      'Time': ee.String(image.get('system:index')).slice(17,-8)});
    
  });
  
  var statsList = ImagesWithStats.aggregate_array('area_in_ha');
  var namesList = ImagesWithStats.aggregate_array('Time');
  
  var statsDict = ee.Dictionary.fromLists(namesList,statsList)
  
  return statsDict
  
}

var stats = ImageStats(imageCollection,geometry,burned_value);

// print('Statistics:', stats)


// ***********************
// *********** Chart

var chart = ui.Chart.array.values(stats.values(),0,stats.keys())
            .setChartType('ColumnChart')
            .setOptions({
            title: 'Wildfire area evolution',
            legend: {position: 'none'},
            hAxis: {title: 'Time of acquistion'},
            vAxis: {title: 'Area in ha'}
            });
 
print(chart);


// Create GIF animation link
var GIFparams = {
  collection: imageCollection.limit(limit),
  description: 'VideoExample',
  dimensions: 1000,
  framesPerSecond: framesPerSecond,
  region: geometry
};

print('GIF animation of the fire progression link:',imageCollection.limit(limit).getVideoThumbURL(GIFparams));


// ****************************
// **** Image visualisation ***

// ImageCollection from bands
// call the prepared function 
var theFunction = require('users/danielp/functions:bandsToImgCollection');

// apply the function
var finalImageCollection = theFunction.bandsToImgCollection(result);

// Get the size of the image list (this is a server side ee.Number object).
// https://gis.stackexchange.com/questions/348014/how-to-display-a-large-series-of-images-to-the-map-with-a-for-loop-in-earth-engi
var listImgs = finalImageCollection.toList(finalImageCollection.size());
var len = listImgs.size();

// Call `.evaluate()` on `len` to convert it from server-side object to a
// client-side object available within the scope of the anonymous function as `l`.
len.evaluate(function(l) {
  for (var i=0; i < l; i++) {
    var img = ee.Image(listImgs.get(i));
    Map.addLayer(img, {}, img.get('system:index').getInfo());
  } 
});




// Generate Land Cover statistics based on CORINE CLC 2018
var corine2018 = ee.Image('COPERNICUS/CORINE/V20/100m/2018');

// select the last image
var selected = ee.Image((imageCollection).toList(imageCollection.size()).get(selected_for_land_cover));

// select the burned areas
var burned = selected.mask(selected.eq(0)).rename('burned');

// mask out the unburned areas from the CORINE CLC
var maskedCorine = corine2018.mask(burned.eq(0))

// add the masked CORINE CLC to the map
Map.addLayer(maskedCorine, {}, 'CORINE CLC 2018 for the last image');

//from here: https://gis.stackexchange.com/questions/415445/calculate-coverage-of-class-types-in-gee
var lc_values = corine2018.get('landcover_class_values');
var lc_values = ee.List(lc_values).map(function (ele) {
  return ee.String(ee.Number(ele).int());
});

var lc_names = corine2018.get('landcover_class_names');
var dict = ee.Dictionary.fromLists(lc_values, lc_names);

// count the pixels at each land cover category
var counts = maskedCorine.reduceRegion({
  reducer: ee.Reducer.frequencyHistogram(),
  geometry: geometry,
  scale: 20
}).values().get(0);

var counts_keys = ee.Dictionary(counts).keys();
var counts_values = ee.Dictionary(counts).values();

// calculate absolute values in hectares
var absolute_counts_values = counts_values.map(function(value){
  return ee.Number(value).multiply(400).divide(10000)
});

// calculate the sum of burned areas in the last image
var sum_area = absolute_counts_values.reduce(ee.Reducer.sum());

// calculate percentages
var percentage_counts_values = absolute_counts_values.map(function(value){
  return ee.Number(value).divide(sum_area).multiply(100)
});

var new_counts_keys = counts_keys.map(function(ele) {
  return ee.String(dict.get(ele))
});

var absolute_BA = ee.Dictionary.fromLists(new_counts_keys, absolute_counts_values);
var relative_LC_BA = ee.Dictionary.fromLists(new_counts_keys, percentage_counts_values);


// add plots of absolute burned areas and percentages
var absolute_BA_chart = ui.Chart.array.values(absolute_counts_values,0,new_counts_keys)
            .setChartType('ColumnChart')
            .setOptions({
            title: 'Total burned areas by land cover types (absolute values)',
            legend: {position: 'none'},
            hAxis: {title: 'Land cover type based on CORINE CLC nomenclature'},
            vAxis: {title: 'Absolute burned areas (hectares)'}
            });
 
print(absolute_BA_chart);

var percentage_BA_chart = ui.Chart.array.values(percentage_counts_values,0,new_counts_keys)
            .setChartType('ColumnChart')
            .setOptions({
            title: 'Share of land cover types on total detected burned areas',
            legend: {position: 'none'},
            hAxis: {title: 'Land cover type based on CORINE CLC nomenclature'},
            vAxis: {title: 'Share of area from total detected burned area (%)'}
            });
 
print(percentage_BA_chart);

// print the calculated values
print('Absolute burned areas detected by SAR clustering by land cover types (in ha)' ,absolute_BA);
print('Land cover types detected by SAR clustering (in %)' ,relative_LC_BA);