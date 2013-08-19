
var EasyOpenLayers = {}

EasyOpenLayers.MapView = Backbone.View.extend({
    el: $("#map"),

    events: {},

    initialize: function() {
        this.map = this.createMap();

        this.osm = this.createOSMLayer();
        this.map.addLayer(this.osm);

        this.poiLayer = this.createPOILayer();
        this.map.addLayer(this.poiLayer);

        this.selectControl = this.createSelectControl(this.poiLayer);
        this.map.addControl(this.selectControl);
        this.selectControl.activate();
        this.poiLayer.events.on({
            "featureselected": this.onFeatureSelect,
            "featureunselected": this.onFeatureUnselect
        });

        this.centerMap();
    },

    createMap: function() {
        var mapArgs = {
            projection: new OpenLayers.Projection('EPSG:4326'),
            controls: [
                new OpenLayers.Control.Navigation(),
                new OpenLayers.Control.PanZoomBar(),
                new OpenLayers.Control.Attribution()
            ],
            maxExtent: this.parseBounds(),
            numZoomLevels: this.parseZoomLevels(),
            units:this.parseUnits(),
            maxResolution: this.parseMaxResolution(),
            theme: null
        };
        return new OpenLayers.Map(this.$el.attr('id'), mapArgs);
    },

    createOSMLayer: function() {
        var layer = new OpenLayers.Layer.OSM();
        layer.transitionEffect = 'resize';
        return layer;
    },

    createPOILayer: function() {
        this.bboxStrategy = new OpenLayers.Strategy.BBOX();
        this.clusterStrategy = new OpenLayers.Strategy.Cluster({
            distance: 50,
            threshold: 2
        });
        this.refreshStrategy = new OpenLayers.Strategy.Refresh({
            force: true,
            active: true
        });

        this.protocol = new OpenLayers.Protocol.HTTP({
            url: this.$el.data('api-url'),
            params: this.parseFilter(),
            format: new OpenLayers.Format.Text()
        });

        this.style = new OpenLayers.Style({
            pointRadius: "${radius}",
            fillColor: "#ff9909",
            fillOpacity: 0.9,
            strokeColor: "#f15800",
            strokeWidth: 10,
            strokeOpacity: 0.4,
            label: "${count}",
            fontColor: "#ffffff"
        },{
            context: {
                radius: function(feature) {
                    return Math.min(Math.max(feature.attributes.count, 10), 50);
                },
                count: function(feature) {
                    return feature.attributes.count;
                }
            }
        });

        var poiLayerArgs = {
            strategies: [
                this.bboxStrategy,
                this.clusterStrategy,
                this.refreshStrategy
            ],
            protocol: this.protocol,
             styleMap: new OpenLayers.StyleMap({
                 "default": this.style,
                 "select": {
                     fillColor: "#8aeeef",
                     strokeColor: "#32a8a9"
                 }
             })
        };

        return new OpenLayers.Layer.Vector("POIs", poiLayerArgs);
    },

    createSelectControl: function(layer) {
        return new OpenLayers.Control.SelectFeature(layer);
    },

    centerMap: function() {
        var initialLon = this.$el.data('initial-lon');
        var initialLat = this.$el.data('initial-lat');
        var initialZoom = this.$el.data('initial-zoom');

        this.map.setCenter(new OpenLayers.LonLat(initialLon, initialLat).transform(
            new OpenLayers.Projection("EPSG:4326"), // transform from WGS 1984
            new OpenLayers.Projection("EPSG:900913") // to Spherical Mercator Projection
        ), initialZoom);
    },

    zoomTo: function(lon, lat, zoom) {
        this.map.setCenter(new OpenLayers.LonLat(lon, lat).transform(
            new OpenLayers.Projection("EPSG:4326"), // transform from WGS 1984
            new OpenLayers.Projection("EPSG:900913") // to Spherical Mercator Projection
        ), zoom);
    },

    parseBounds: function() {
        var b = {
            "left": this.$el.data('map-bounds-left') || -20037508.34,
            "right": this.$el.data('map-bounds-right') || 20037508.34,
            "top": this.$el.data('map-bounds-top') || 20037508.34,
            "bottom": this.$el.data('map-bounds-bottom') || -20037508.34
        };

        return new OpenLayers.Bounds(b['left'], b['bottom'], b['right'], b['top']);
    },

    parseZoomLevels: function() {
        return 18;
    },

    parseUnits: function() {
        return "meters";
    },

    parseMaxResolution: function() {
        return 156543;
    },

    parseFilter: function() {
        var cat = this.$el.data('filter-category') || '';
        var subcat = this.$el.data('filter-subcategory') || '';
        var src = this.$el.data('filter-map-source') || '';
        var keywords = this.$el.data('filter-keywords') || '';
        return {
            'cat': cat,
            'subcat': subcat,
            'src': src,
            'kw': keywords
        }
    },

    onFeatureSelect: function(evt) {
        var feature = evt.feature;
        var content;

        if (!feature.cluster) {
            content = feature.attributes.title + '<br/>' + feature.attributes.description;
        } else if (feature.cluster.length == 1) {
            content = feature.cluster[0].attributes.title + '<br/>' + feature.cluster[0].attributes.description;
        } else {
            content = '';
            var length = Math.min(feature.cluster.length, 50);
            for (var c = 0; c < length; c++) {
                content += feature.cluster[c].attributes.title + '<br/>';
            }
            if (length < feature.cluster.length) {
                content += '(...)';
            }
        }
        var self = this;

        var popup = new OpenLayers.Popup.FramedCloud('featurePopup',
            feature.geometry.getBounds().getCenterLonLat(),
            new OpenLayers.Size(300, 100),
            content, null, true,
            function(evt) {
                var feature = this.feature;
                if (feature.layer) {
                    self.selectControl.unselect(feature);
                } else {
                    this.destroy();
                }
            }
        );

        popup.maxSize = new OpenLayers.Size(500, 300);
        feature.popup = popup;
        popup.feature = feature;
        this.map.addPopup(popup, true);
    },

    onFeatureUnselect: function(evt) {
        var feature = evt.feature;
        if (feature.popup) {
            feature.popup.feature = null;
            this.map.removePopup(feature.popup);
            feature.popup.destroy();
            feature.popup = null;
        }
    },

    refresh: function() {
        var filter = this.parseFilter();
        this.protocol.params['cat'] = filter['cat']
        this.protocol.params['subcat'] = filter['subcat']
        this.protocol.params['src'] = filter['src']
        this.protocol.params['kw'] = filter['kw']
        this.refreshStrategy.refresh();
    },
});

