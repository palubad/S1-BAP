# Sentinel-1 Burned Area Progression (S1-BAP) toolbox in Google Earth Engine (GEE)
This code repository is an attachment for the article in the IEEE JSTARS by Paluba D. et al. (2024) entitled "Tracking burned area progression in an unsupervised manner using Sentinel-1 SAR data in Google Earth Engine", DOI: [https://doi.org/10.1109/JSTARS.2024.3427382](https://doi.org/10.1109/JSTARS.2024.3427382).

Full citation: D. Paluba et al., "Tracking burned area progression in an unsupervised manner using Sentinel-1 SAR data in Google Earth Engine," in IEEE Journal of Selected Topics in Applied Earth Observations and Remote Sensing, doi: [10.1109/JSTARS.2024.3427382](https://doi.org/10.1109/JSTARS.2024.3427382).

A three-step automatic toolbox in GEE, called the 'Sentinel-1 Burned Area Progression Toolbox' (S1-BAP), was developed to map fire-affected areas using all available acquisitions of Sentinel-1 Synthetic Aperture Radar (SAR) data using an unsupervised approach, providing not only the maps of burned area evolution, but also the underlying statistics about the land cover, which was affected and detected. 

1. In the first step, the user sets the region of interest (ROI), start and end date of the fire event, the moving kernel window size for feature smoothing, use of polarized bands (VV, VH only or ALL) or sets an own list of available features to use for clustering.
    - The area of interest can be drawn using the Drawing Tools on the map, or it can be imported to GEE as an Asset.
    - The start and the end date of the fire can be inspected e.g., on the 'Current Situation Viewer' application on the COPERNICUS Emergency Management Service EFFIS website using the MODIS/SENTINEL2 Burned Area product (https://effis.jrc.ec.europa.eu/apps/effis_current_situation/ last accessed on 31.08.2023).
    - The algorithm identifies how many different S1 acquisition paths are available for the selected area and time frame and creates a collection of image sub-collections based on different acquisition geometry (satellite-orbit-path).
    - The exportable output (to GEE Assets) of the first step is the pre-processed image dataset for the selected area and dates, and the geometry of the selected area (ROI).

2. In the second step, the exported ROI geometry and the input data are used to classify binary maps of burned-unburned areas for each time step available in the selected time frame. As in the article, the k-means clustering is used with 2 clusters, Manhattan distance and the farthest first initialization method.
    - The exportable output of this step is the classified images in the selected time frame.

3. The images from the second step can be used in the third step to generate:
    - graphs with the quantified burned areas,
    - GIF time series animation and
    - an analysis of affected land cover classes based on the CLC.
   
The S1-WPM toolbox is freely available to the general public and is available from the GitHub repository at the following link: https://github.com/palubad/S1-WPM (will be publicly available after the article is published) and can also be imported to GEE using the following link: https://code.earthengine.google.com/?accept_repo=users/danielp/S1-BAP (last accessed on 31.08.2023).







This data repository includes all the input FeatureCollections and Images, as well as the final results of the unsupervised clustering documented in Paluba et al. (2024): Tracking burned area progression in an unsupervised manner using Sentinel-1 SAR data in Google Earth Engine.

- The elements starting with 'Selected_geoemtry_' stands for input geometries
- The elements starting with 'input_images_' stands for preprocessed Sentinel-1 features
- The elements starting with 'Results_' stands for the final results of the unsupervised clustering based on Paluba et al. (2024)



--
This dataset is free and open. 
By using it, you agree to cite the following reference 
in any publications derived from them:
 
D. Paluba et al., "Tracking burned area progression in an unsupervised manner using Sentinel-1 SAR data in Google Earth Engine," in IEEE Journal of Selected Topics in Applied Earth Observations and Remote Sensing, doi: [10.1109/JSTARS.2024.3427382](https://doi.org/10.1109/JSTARS.2024.3427382).
--
