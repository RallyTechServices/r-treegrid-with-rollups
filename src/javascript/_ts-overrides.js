Ext.override(Rally.app.AppSettings,{
    logger: new Rally.technicalservices.Logger(),
    // something wrong with field names for get value from field selector
    _saveAppScopedSettings: function() {
        var me = this;
        
        if (this.getAppScopedSettingsForm() && Ext.Object.getSize(this.getAppScopedSettingsForm().getValues())) {
            
            var globalAppSettings = this.getAppScopedSettingsForm().getValues(false,false,false,true);
            
            // Use the displayName instead of the name so we can have the spaces ready for display
            var additional_fields = [];
            
            Ext.Array.each(globalAppSettings.additional_fields_for_pis,function(field){
                me.logger.log("SETTINGS FIELD ");
                me.logger.log(field);
                me.logger.log(field.get('displayName'));
                me.logger.log(field.get('name'));
                
                additional_fields.push(field.get('name'));
            });
            globalAppSettings.additional_fields_for_pis = additional_fields;
            
            Ext.apply(this.settings, globalAppSettings);
    
            Rally.data.PreferenceManager.update({
                appID: this.getContext() && this.getContext().get('appID'),
                settings: globalAppSettings,
                project: null,
                workspace: null,
                success: function(updatedRecords, notUpdatedRecords) {
                    this._saveScopedSettings({
                        updatedRecords: updatedRecords,
                        notUpdatedRecords: notUpdatedRecords
                    });
                },
                scope: this
            });
        } else {
            this._saveScopedSettings({
                updatedRecords: [],
                notUpdatedRecords: []
            });
        }
    }
});