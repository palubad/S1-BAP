/*
This code performs preprocessing of Sentinel-1 data for unsupervised burned area
progression monitoring, based on Paluba et al. (2024).

* Set the input parameters in the *SETTINGS FOR THE USER* section of this code,
on lines 35-58. After you set the input parameters, RUN the code and export 
the sub-products in the "Tasks" bar for the next steps (selected geometry and 
the preprocessed input images).

--
This code is free and open. 
By using this code and any data derived with it, 
you agree to cite the following reference 
in any publications derived from them:
 
    D. Paluba et al., "Tracking burned area progression in an 
    unsupervised manner using Sentinel-1 SAR data in Google Earth Engine," in 
    IEEE Journal of Selected Topics in Applied Earth Observations and Remote Sensing, 
    doi: 10.1109/JSTARS.2024.3427382.

--

Authors of the code: Daniel Paluba (palubad@natur.cuni.cz) & Lorenzo G. Papale 
*/

// Load data from Paluba et al. (2024)
var tatoi = ee.FeatureCollection('users/danielp/S1BAP/Selected_geometry_Tatoi').first().geometry();
var evia = ee.FeatureCollection('users/danielp/S1BAP/Selected_geometry_Evia').first().geometry();
var olympia = ee.FeatureCollection('users/danielp/S1BAP/Selected_geometry_Olympia').first().geometry();
var megara = ee.FeatureCollection('users/danielp/S1BAP/Selected_geometry_Megara').first().geometry();

// ======================================================================== //
// ====================== SETTINGS FOR THE USER ========================== //
// ====================================================================== //

// 1. Set your selected area as geometry
var geometry = megara;

// 2. Select start and end dates
var fireStartDate = '2021-08-16'; // Start of the fire
var fireEndDate = '2021-08-25'; // End of the fire
var startDate = ee.Date(fireStartDate).advance(-12,'month'); // Period to include in the long time series analysis
/* Date settings for the ROIs in Paluba et al. (2024):
     - Tatoi --> start = '2021-08-03', end = '2021-08-13'
     - Megara --> start = '2021-08-16', end = '2021-08-25'
     - Evia & Olympia --> start = '2021-08-03', end = '2021-08-19'
*/
// 3. Select smoothing kernel window size [Integer, e.g. 3,5,7,9, etc.]
var kernelSize = 19;

// 4. Select which indices to use [list of strings]
// available indices: 'diffRFDI', 'diffRVI', 'kmap_VH', 'kmap_VV', 'logRatio_VH', 'logRatio_VV'
var selectedIndices = ['diffRFDI','kmap_VH','kmap_VV','logRatio_VH','logRatio_VV'];

// 5. Select polarization filter [String]
// available options: 'ALL', 'VH', 'VV'
var pol_filter = 'ALL';

// 6. Set the CRS in EPSG - based on your selected ROI
var crs = 'EPSG:32634';


//*******************************************************************************************
//                            CREATE SAR POLARIMETRIC INDICES

geometry = geometry.bounds()

// Center the view on your ROI
Map.centerObject(geometry, 11);

// Add the Atmospheric penetration composite using Sentinel-2 data
Map.addLayer(ee.ImageCollection("COPERNICUS/S2_SR")
            .filterBounds(geometry)
            .filterDate(fireStartDate,fireEndDate).sort('system:time_start',false).median(), 
            {min:0, max:3000, bands:['B12','B11', 'B8']}, 
            'S-2 Atmospheric penetration composite [B12-B11-B9]');

// calculate RVI, RFDI and DPSVI
var indices = function(img) {
  var RVI = (ee.Image(4).multiply(img.select('VH')))
            .divide(img.select('VV').add(img.select('VH'))).rename('RVI');
  var RFDI = (img.select('VV').subtract(img.select('VH')))
              .divide(img.select('VV').add(img.select('VH'))).rename('RFDI');
  
  return img.addBands([RVI,
                      RFDI
                      ]).copyProperties(img,img.propertyNames());
};

// Load Sentinel-1 images
var s1 = ee.ImageCollection('COPERNICUS/S1_GRD_FLOAT')
    .filter(ee.Filter.listContains('transmitterReceiverPolarisation', 'VV'))
    .filter(ee.Filter.listContains('transmitterReceiverPolarisation', 'VH'))
    .filter(ee.Filter.eq('instrumentMode', 'IW'))
    .filterBounds(geometry)
    .filterDate(startDate, fireEndDate );


// call the prepared function to merge overlapping images over the ROI
var theFunction = require('users/danielp/functions:makeMosaicsFromOverlappingTiles_function');

// apply the function
var finalCollection = theFunction.makeMosaicsFromOverlappingTiles(s1,geometry);


// Add indices and use speckle filter
var S1Collection = finalCollection
                    .map(indices).sort('system:time_start');

// prepare the post-fire image collection
var post_fire_images = S1Collection.filterDate(fireStartDate, fireEndDate );

// load JRC Global Surface Water database for masking out water areas
var JRC = ee.Image('JRC/GSW1_3/GlobalSurfaceWater');
var waterMask = JRC.select('occurrence').gt(10).unmask().eq(0).clip(geometry);

// *****************************************
// ********** Visualisation check

var postImage = post_fire_images.sort('system:time_start',false).first();
  var satellite = postImage.get('platform_number');
  var path = ee.Number.parse(postImage.get('relativeOrbitNumber_start'));
  var orbit = postImage.get('orbitProperties_pass');

  var pre_TS_collection_vis = S1Collection
                        .filterDate(startDate, fireStartDate)
                        .filter(ee.Filter.eq('platform_number', satellite))
                        .filter(ee.Filter.eq('relativeOrbitNumber_start', path))
                        .filter(ee.Filter.eq('orbitProperties_pass', orbit))
                        .sort('system:time_start');

var preImage = pre_TS_collection_vis
                .filterDate(ee.Date(fireStartDate).advance(-1,'month'), fireStartDate)
                .median();

var MT_RGB_SW = ee.Image.cat(preImage.select(['VV','VH']).rename("preVV", "preVH"),postImage.select(['VV','VH']).rename("postVV", "postVH"));

Map.addLayer(MT_RGB_SW, {bands: ["postVH", "preVH", "preVH"], min: -25, max: -5}, "MT_RGB_SW_VH: post-pre-pre",0);
Map.addLayer(MT_RGB_SW, {bands: ["preVH", "postVH", "postVH"], min: -25, max: -5}, "MT_RGB_SW_VH: pre-post-post",0);

// adjust kernel size
kernelSize = ee.Number(kernelSize).subtract(1).divide(2);

//******************************************************************** //
// *************** THE MAIN FUNCTION *********************************//
var imagePreparation = function (img) {
  var postImage = img;

  var satellite = postImage.get('platform_number');
  var path = ee.Number.parse(postImage.get('relativeOrbitNumber_start'));
  var orbit = postImage.get('orbitProperties_pass');
  
  // long-term time series collection - create only pre-fire TS collection 
  var pre_TS_collection = S1Collection
                        .filterDate(startDate, fireStartDate)
                        .filter(ee.Filter.eq('platform_number', satellite))
                        .filter(ee.Filter.eq('relativeOrbitNumber_start', path))
                        .filter(ee.Filter.eq('orbitProperties_pass', orbit));

  // create median composite from images acquired one month before fire started
  var preImage = pre_TS_collection
                .filterDate(ee.Date(fireStartDate).advance(-1,'month'), fireStartDate)
                .median();

  // create statistics images
  var median = pre_TS_collection.reduce(ee.Reducer.median(),16);
  var mean = pre_TS_collection.reduce(ee.Reducer.mean(),16);

  var stdDev = pre_TS_collection.reduce(ee.Reducer.sampleStdDev(),16);
  
  var diffRVI = postImage.select('RVI').subtract(preImage.select('RVI'));
  var diffRFDI = postImage.select('RFDI').subtract(preImage.select('RFDI'));
  
  // calculate the log-ratio image
  var logRatio_VH = postImage.select('VH').subtract(preImage.select('VH'));
  var logRatio_VV = postImage.select('VV').subtract(preImage.select('VV'));

  // calculate the k-map
  var kmap_VH = (logRatio_VH.abs().divide(stdDev.select('VH_stdDev'))).rename('changeVH');
  var kmap_VV = (logRatio_VV.abs().divide(stdDev.select('VV_stdDev'))).rename('changeVV');
  
  // create an image for classification
  var forClass = ee.Image.cat( 
                              diffRFDI.rename('diffRFDI'), 
                              kmap_VH.rename('kmap_VH'),
                              kmap_VV.rename('kmap_VV'),
                              logRatio_VH.rename('logRatio_VH'),
                              logRatio_VV.rename('logRatio_VV')
                              // diffRVI.rename('diffRVI')
                              ).updateMask(waterMask);
  
  var smoothed = forClass.select(selectedIndices).reduceNeighborhood({
    reducer: ee.Reducer.mean(),
    kernel: ee.Kernel.square(kernelSize)
    });
  
    // select indices to use
  if (pol_filter == 'VH') {
    pol_filter = ee.Filter.or(
                    ee.Filter.stringContains('item','VH'),
                    ee.Filter.stringContains('item','RVI'),
                    ee.Filter.stringContains('item','RFDI')
                    );
  }
  
  if (pol_filter == 'VV') {
    pol_filter = ee.Filter.or(
                      ee.Filter.stringContains('item','VV'),
                      ee.Filter.stringContains('item','RVI'),
                    ee.Filter.stringContains('item','RFDI')
                    );
  }
  
  if (pol_filter == 'ALL') {
    pol_filter = ee.Filter.or(
                      ee.Filter.stringContains('item','VH'),
                      ee.Filter.stringContains('item','VV'),
                      ee.Filter.stringContains('item','RVI'),
                    ee.Filter.stringContains('item','RFDI')
                    );
  }
  
  var pol_selection = smoothed.bandNames().filter(pol_filter);
                    
  smoothed = smoothed.select(ee.List(pol_selection));

  return (ee.ImageCollection(smoothed).toBands())
                  .set('system:time_start',img.get('system:time_start'))
                  .set('system:index',img.get('system:index'));
};


var preparedImages = post_fire_images.sort('system:time_start')
                      .map(imagePreparation);

// preparedImages = theFunction.makeMosaicsFromOverlappingTiles(preparedImages,geometry)
                   

print('Images to export:', preparedImages);

// Image 
var oneImage = preparedImages.toBands()
                .set('numberOfImages',preparedImages.size());

Export.image.toAsset({image: ee.Image(oneImage).toFloat(),
                      description: 'S1BAP_input_images', 
                      region: geometry,
                      scale: 20,
                      crs: crs,
                      maxPixels: 10e9});

Export.table.toAsset({collection: ee.FeatureCollection(ee.Feature(geometry)),
                      description: 'S1BAP_selected_geometry'});

// Export.image.toDrive({image: finalResults.first().toFloat(), 
//                       description: "_ALL", 
//                       folder: 'NewALL',
//                       region: geometry,
//                       scale: 20,
//                       crs: 'EPSG:32634',
//                       maxPixels: 10e9})
