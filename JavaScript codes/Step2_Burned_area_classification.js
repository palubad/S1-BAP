// Add your selected geometry exported in the previous step
var geometry = ee.FeatureCollection('users/danielp/S1BAM_selected_geometry_athens2');
// S1BAM_selected_geometry_athens, Sparta2021, Slovenia2022
 
// Add the exported image
var input_images = ee.Image('users/danielp/0_FINAL_Athens2_progression_19x19');

print(input_images);
// Set the CRS in EPSG
var crs = 'EPSG:32634';

// Select polarization filter [String]
// available options: 'ALL', 'VH', 'VV'
var pol_filter = 'ALL';

////////////////////////////// 
// testing bands
////////////////////////////// 
var pol_filter = 
  ee.Filter.or( 
              ee.Filter.stringContains('item','RFDI'),
              ee.Filter.stringContains('item','kmap_VH'),
              ee.Filter.stringContains('item','kmap_VV'),
              ee.Filter.stringContains('item','logRatio_VH'),
              ee.Filter.stringContains('item','logRatio_VV')
              // ee.Filter.stringContains('item','RVI')
              );

var pol_selection = input_images.bandNames().filter(pol_filter);

input_images = input_images.select(ee.List(pol_selection));


// Create 1 km km inverse buffer to avoid including NoData values 
geometry = geometry.first().geometry().buffer(-2000);

Map.centerObject(geometry,11);

Map.addLayer(geometry);
Map.addLayer(input_images);


// ****************************************************
// ************ Create ImageCollection from bands *****
// ****************************************************
var number_images = ee.Number(input_images.get('numberOfImages'));
var input_bands = input_images.bandNames();
var total_input_bands = input_images.bandNames().size();

print(input_bands)
var number_bands = total_input_bands.divide(number_images);

var seq = ee.List.sequence(number_bands,total_input_bands,number_bands);

var create_image = function (slice) {
  var sliced_bands = ee.List(input_bands).slice(ee.Number(slice).subtract(number_bands),slice);
  var image_name = ee.String(sliced_bands.get(0)).slice(0,32);
  var image = input_images.select(sliced_bands)
              .set('system:index',image_name);
  return image;
};

var imgColl = ee.ImageCollection(seq.map(create_image));
print('Prepared ImageCollection',imgColl);
  
// ****************************************************
// ************ Unsupervised classification ***********
// ****************************************************
var classification = function (img) {
  
  var training = img.sample({
    region: geometry,
    scale: 20,
    // numPixels: 15000,
    factor: 0.2,
    seed: 42,
    tileScale: 16
  });
  
  training = training.filter(ee.Filter.notNull(img.bandNames()))

  // K-means++
  var clusterer = ee.Clusterer.wekaKMeans({
                  nClusters: 2,
                  distanceFunction: 'Manhattan',
                  init: 3,
                  seed: 42,
                  // maxIterations:200
                  }).train(training);
              
  // Cluster the input using the trained clusterer.
  var clusterResult = img.cluster(clusterer);
  
  // Generate the mode value from the reference region and convert it to ee.Number
  // *** reference region = region, where the majority of area is highly burned
  var mode_fromRegion = clusterResult.reduceRegion({
          geometry: geometry,
          reducer: ee.Reducer.mode(),
          scale: 20,
          tileScale: 16
        });
  
  var fire_cluster = ee.Number.parse(mode_fromRegion.get("cluster"));
  
  
  // Select cluster corresponding to the fire event
  var binaryCluster = clusterResult.eq(fire_cluster).rename([img.get('system:index')]);

  var connected = 50,
      focalSize = 100,
      unit = "meters";
      // connected 25 = 1 ha, 50 = 2ha, 125 = 5ha, 250 for 10ha
      // focalSize = 2xconnected area. 50 for 0.5 ha, 71 for 1 ha, 100 for 2ha, 160 for 5ha, 224 for 10ha
  
  // Filter out small areas
  // count patch sizes
  var patchsize = binaryCluster.connectedPixelCount(connected, false);
  
  // run a majority filter --> this was used for training
  var filtered50 = binaryCluster.focalMode(focalSize, "square", unit);
  
  // updated image with majority filter where patch size is small
  var filteredBinaryCluster =  binaryCluster.where(patchsize.lt(connected).unmask(),filtered50).rename('cluster');

  // return filteredBinaryCluster2.eq(0).unmask().set('system:index',img.get('system:index'));
  return filteredBinaryCluster
};

// Apply classifications for each image
var unsup_results = imgColl.map(classification);

print(unsup_results);

var results_in_bands = ee.ImageCollection(unsup_results).toBands();
var result_names = results_in_bands.bandNames();
print(result_names)


// Get the size of the image list (this is a server side ee.Number object).
// https://gis.stackexchange.com/questions/348014/how-to-display-a-large-series-of-images-to-the-map-with-a-for-loop-in-earth-engi
var listImgs = unsup_results.toList(unsup_results.size());
var len = listImgs.size();

// Call `.evaluate()` on `len` to convert it from server-side object to a
// client-side object available within the scope of the anonymous function as `l`.
len.evaluate(function(l) {
  for (var i=0; i < l; i++) {
    var img = ee.Image(listImgs.get(i));
    Map.addLayer(img, {}, img.get('system:index').getInfo(),0);
  } 
});

Export.image.toAsset({image: ee.Image(results_in_bands).toFloat(), 
                      description: "S1BAM_results", 
                      region: geometry.buffer(2000),
                      scale: 20,
                      crs: crs,
                      maxPixels: 10e9});
                      
Export.image.toDrive({image: ee.Image(results_in_bands).toFloat(), 
                      description: "S1BAM_clustering_results_to_Drive", 
                      folder: 'S1BAM',
                      region: geometry.buffer(2000),
                      scale: 20,
                      crs: crs,
                      maxPixels: 10e9})
                      