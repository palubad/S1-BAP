// Load the predefined geometry
var Oly_geometry = 
    /* color: #d63000 */
    /* shown: false */
    ee.Geometry.Polygon(
        [[[21.458133205617063, 37.74797921043348],
          [21.458133205617063, 37.600152715543224],
          [21.91337917729675, 37.600152715543224],
          [21.91337917729675, 37.74797921043348]]], null, false),
    evia_geometry = 
    /* color: #d63000 */
    /* shown: false */
    ee.Geometry.Polygon(
        [[[23.122129452028535, 39.05932301569821],
          [23.122129452028535, 38.678682048995924],
          [23.498411190309785, 38.678682048995924],
          [23.498411190309785, 39.05932301569821]]], null, false),
    athens_geometry = 
    /* color: #98ff00 */
    /* shown: false */
    ee.Geometry.Polygon(
        [[[23.74517928446036, 38.23905210135975],
          [23.74517928446036, 38.086265672591296],
          [23.90722762430411, 38.086265672591296],
          [23.90722762430411, 38.23905210135975]]], null, false);

var athens = athens_geometry;
var evia = evia_geometry;
var olympia = Oly_geometry;
var athens2 = ee.FeatureCollection('users/danielp/S1BAM_selected_geometry_athens2').first().geometry();

//*******************************************************************************************
//                            SELECT AN AREA OF INTEREST AND REFENCE POINT

// Set your selected area as geometry
var geometry = olympia;

// Set the CRS in EPSG
var crs = 'EPSG:32634';

// Select smoothing kernel window size [Integer, e.g. 3,5,7,9, etc.]
var kernelSize = 19;

// Select which indices to use [list of strings]
// available indices: 'diffRFDI', 'diffRVI', 'kmap_VH', 'kmap_VV', 'logRatio_VH', 'logRatio_VV'
var selectedIndices = ['diffRFDI','kmap_VH','kmap_VV','logRatio_VH','logRatio_VV'];

// Select polarization filter [String]
// available options: 'ALL', 'VH', 'VV'
var pol_filter = 'ALL';

// Select dates
var fireStartDate = '2021-08-06';
var fireEndDate = '2021-08-25';
var startDate = ee.Date(fireStartDate).advance(-12,'month');
// athens -- start = 08-03, end = 08-13
// athens2 -- start = 08-16, end = 08-25
// others -- start = 08-03, end = 08-19

//*******************************************************************************************
//                            CREATE SAR POLARIMETRIC INDICES

Map.centerObject(geometry, 11);

Map.addLayer(ee.ImageCollection("COPERNICUS/S2_SR")
.filterBounds(geometry)
.filterDate(fireStartDate,fireEndDate).sort('system:time_start',false).first(), 
{min:0, max:3000, bands:['B12','B11', 'B8']}, 
'S-2 Atmospheric penetration composite [B12-B11-B9]')

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

// convert power units to dB
var powerToDb = function powerToDb (img){
  return ee.Image(10).multiply(img.log10()).copyProperties(img,img.propertyNames());
};


var s1 = ee.ImageCollection('COPERNICUS/S1_GRD_FLOAT')
    .filter(ee.Filter.listContains('transmitterReceiverPolarisation', 'VV'))
    .filter(ee.Filter.listContains('transmitterReceiverPolarisation', 'VH'))
    .filter(ee.Filter.eq('instrumentMode', 'IW'))
    .filterBounds(geometry)
    .filterDate(startDate, fireEndDate );

// print('Available S-1 images', s1);
// print(s1.limit(5).map(robustScaler))
// Map.addLayer(s1.limit(5).map(robustScaler).first())
// var percentiles = s1.first().reduceRegion({
//       reducer: ee.Reducer.percentile([25, 75]),
//       geometry: geometry,
//       scale: 20,
//       maxPixels: 1e9
//     });
// print(percentiles.values())

// call the prepared function to merge overlapping images over the ROI
var theFunction = require('users/danielp/functions:makeMosaicsFromOverlappingTiles_function');

// apply the function
var finalCollection = theFunction.makeMosaicsFromOverlappingTiles(s1,geometry);


// Add indices and use speckle filter
var S1Collection = finalCollection
                    .map(indices).sort('system:time_start');

// prepare the post-fire image collection
var post_fire_images = S1Collection.filterDate(fireStartDate, fireEndDate )//.map(powerToDb);

// load JRC Global Surface Water database for masking out water areas
var JRC = ee.Image('JRC/GSW1_3/GlobalSurfaceWater');
var waterMask = JRC.select('occurrence').gt(10).unmask().eq(0).clip(geometry);

// *****************************************
// ********** Visualisation check

var postImage = post_fire_images.sort('system:time_start',false).first()
  var satellite = postImage.get('platform_number');
  var path = ee.Number.parse(postImage.get('relativeOrbitNumber_start'));
  var orbit = postImage.get('orbitProperties_pass');

  var pre_TS_collection_vis = S1Collection
                        .filterDate(startDate, fireStartDate)
                        .filter(ee.Filter.eq('platform_number', satellite))
                        .filter(ee.Filter.eq('relativeOrbitNumber_start', path))
                        .filter(ee.Filter.eq('orbitProperties_pass', orbit))
                        // .map(powerToDb).sort('system:time_start')

var preImage = pre_TS_collection_vis
                .filterDate(ee.Date(fireStartDate).advance(-1,'month'), fireStartDate)
                .median();

var MT_RGB_SW = ee.Image.cat(preImage.rename("preVV", "preVH", "preAngle",'RVI'),postImage.rename("postVV", "postVH", "postAngle",'RVI2'));

Map.addLayer(MT_RGB_SW, {bands: ["postVH", "preVH", "preVH"], min: -25, max: -5}, "MT_RGB_SW_VH: post-pre-pre",0);
Map.addLayer(MT_RGB_SW, {bands: ["preVH", "postVH", "postVH"], min: -25, max: -5}, "MT_RGB_SW_VH: pre-post-post",0);

// adjust kernel size
kernelSize = ee.Number(kernelSize).divide(2);

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
                        .filter(ee.Filter.eq('orbitProperties_pass', orbit))

  // create median composite from images acquired one month before fire started
  var preImage = pre_TS_collection
                .filterDate(ee.Date(fireStartDate).advance(-1,'month'), fireStartDate)
                .median();

  // create statistics images
  var median = pre_TS_collection.reduce(ee.Reducer.median(),16)//.clip(geometry);
  var mean = pre_TS_collection.reduce(ee.Reducer.mean(),16)//.clip(geometry);

  var stdDev = pre_TS_collection.reduce(ee.Reducer.sampleStdDev(),16)//.clip(geometry);
  
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
    })
  
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
                   

print('Images to export:', preparedImages)

// Image 
var oneImage = preparedImages.toBands()
                .set('numberOfImages',preparedImages.size());

Export.image.toAsset({image: ee.Image(oneImage).toFloat(),
                      description: 'S1BAM_input_images', 
                      region: geometry,
                      scale: 20,
                      crs: crs,
                      maxPixels: 10e9})

Export.table.toAsset({collection: ee.FeatureCollection(ee.Feature(geometry)),
                      description: 'S1BAM_selected_geometry'})
