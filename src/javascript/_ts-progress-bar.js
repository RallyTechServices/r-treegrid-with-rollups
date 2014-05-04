Ext.define('Rally.technicalservices.ProgressBarTemplate', {
    requires: [],
    extend: 'Ext.XTemplate',

    config: {
        /**
         * @cfg {String} width define a width if necessary to fit where it's being used
         */
        width: '100%',
        /**
         * @cfg {String} height define a height if necessary to fit where it's being used
         */
        height: '20px',
        /**
         * @cfg {String} numeratorField will divide numeratorField value / denominatorField value to 
         * get percent done
         */
        numeratorField: 'percentDone',
        /**
         * @cfg {String} denominatorField will divide numeratorField value / denominatorField value to 
         * get percent done
         */
        denominatorField: 'percentDone',
        /**
         * @cfg {Function} showDangerNotificationFn A function that should return true to show a triangle in the top right to denote something is missing.
         * Defaults to:
         *      function(){ return false; }
         */
        showDangerNotificationFn: function() {
            return false;
        },

        /**
         * @cfg {Function} (required)
         * A function that returns the color for the percent done bar in hex
         */
        calculateColorFn: function(recordData) {            
            var numerator = recordData[this.config.numeratorField] || 0;
            var denominator = recordData[this.config.denominatorField] || 0;
            
            var percentDone = 0;
            
            if ( denominator > 0 ) {
                percentDone = numerator / denominator;
            }
                
            var color = '#cff';
            var start_date = recordData['PlannedStartDate'] ;
            if ( start_date === null ) { 
                start_date = new Date();
            }
            var end_date = recordData['PlannedEndDate'];
            
            if ( end_date !== null ) {
                var color = Rally.util.HealthColorCalculator.calculateHealthColor({
                    startDate: start_date,
                    endDate: end_date,
                    asOfDate: new Date(),
                    percentComplete: percentDone
                }).hex;
            }
            
            return color;
        },

        /**
         * @cfg {Boolean} (optional)
         * A boolean that indicates whether the progress bar is clickable
         */
        isClickable: false,

        /**
         * @cfg {Boolean} If the percent done is 0%, do not show the bar at all
         */
        showOnlyIfInProgress: false,

        /**
         * @cfg {Function}
         * A function that returns the text to show in the progress bar.
         * Defaults to a function that returns the percentage complete.
         */
        generateLabelTextFn: function (recordData) {
            return this.calculatePercent(recordData) + '%';
        }
    },

    constructor: function(config) {
        this.initConfig(config);
        config = this.config;
        var templateConfig = [
            '<tpl if="this.shouldShowPercentDone(values)">',
                '<div class="progress-bar-container field-{[this.getDenominatorField()]} {[this.getClickableClass()]} {[this.getContainerClass(values)]}" style="{[this.getDimensionStyle()]}">',
                    '<div class="progress-bar" style="background-color: {[this.calculateColor(values)]}; width: {[this.calculateWidth(values)]}; "></div>',
                    '<tpl if="this.showDangerNotification(values)">',
                        '<div class="progress-bar-danger-notification"></div>',
                    '</tpl>',
                    '<div class="progress-bar-label">',
                        '{[this.generateLabelText(values)]}',
                    '</div>',
                '</div>',
            '</tpl>',
            {
                shouldShowPercentDone: function(recordData) {
                    return true;
                },
                getContainerClass: function(recordData) {
                    if (recordData && recordData.FormattedID) {
                        return recordData.FormattedID + '-' + config.denominatorField;
                    }
                    return '';
                },
                getClickableClass: function(){
                    return config.isClickable ? 'clickable' : '';
                },
                getDimensionStyle: function(){
                    return 'width: ' + config.width + '; height: ' + config.height + '; line-height: ' + config.height;
                },
                calculateWidth: function (recordData) {
                    var percentDone = this.calculatePercent(recordData);
                    return percentDone > 100 ? '100%' : percentDone + '%';
                },
                calculatePercent: function (recordData) {
                    var numerator = recordData[config.numeratorField] || 0;
                    var denominator = recordData[config.denominatorField] || 0;
                    
                    var percentDone = 0;
                    if ( denominator > 0 ) {
                        percentDone = numerator / denominator;
                    }
                    return Math.round(percentDone * 100);
                },
                generateLabelText: config.generateLabelTextFn,
                calculateColor: config.calculateColorFn,
                showDangerNotification: config.showDangerNotificationFn
            }];

        return this.callParent(templateConfig);

    }
});