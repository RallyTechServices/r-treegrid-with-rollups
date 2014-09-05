Ext.override(Rally.app.AppSettings,{
    logger: new Rally.technicalservices.Logger(),
    _drawField: function(form, fieldConfig) {
        this.logger.log("config",fieldConfig);
        var fieldConfig = this._insertValueIntoChildItems(fieldConfig);
        
        var field = this._createFieldFromConfig(fieldConfig);
        this._applyScopeToField(field);
        this._addFieldToForm(form, field, fieldConfig);
    },
    _insertValueIntoChildItems: function(fieldConfig) {
        if ( fieldConfig.xtype == "container" ) {
            var items = [];
            Ext.Array.each(fieldConfig.items, function(item){
                items.push(this._insertValueIntoChildItems(item));
            },this);
            fieldConfig.items = items;
        } else {
            this.logger.log("working on field",fieldConfig.name);
            var fieldName = fieldConfig.name || fieldConfig.type;
            var fieldValue = this._getValueForField(fieldConfig, fieldName, this.settings) || fieldConfig.initialValue;
            fieldConfig.value = fieldValue;
        }
        
        return fieldConfig;
    }
});