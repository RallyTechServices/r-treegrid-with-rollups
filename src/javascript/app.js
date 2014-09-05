Ext.define('CustomApp', {
    extend: 'Rally.app.App',
    componentCls: 'app',
    logger: new Rally.technicalservices.Logger(),
    items: [
        {xtype:'container',itemId:'message_box', margin: 5},
        {xtype:'container',itemId:'selector_box', margin: 5},
        {xtype:'container',itemId:'display_box', margin: 5},
        {xtype:'tsinfolink'}
    ],
    launch: function() {
        
        if (typeof(this.getAppId()) == 'undefined' ) {
            // not inside Rally
            this._showExternalSettingsDialog(this.getSettingsFields());
        } else {
            this._getData();
        }
    },
    _addButton: function(tree) {
        if ( this._isAbleToDownloadFiles() ) {
            this.down('#selector_box').add({
                xtype:'rallybutton',
                itemId:'save_button',
                text:'Save As CSV',
                scope: this,
                handler: function() {
                    var csv = this._getCSVFromTree(tree);
                    this._saveCSVToFile(csv,'pert.csv',{type:'text/csv;charset=utf-8'});
                }
            });
        }
    },
    _getData: function() {
        this.down('#message_box').update();
    
        this._getPortfolioItemNames().then({
            scope: this,
            success: function(pi_paths) {
                if ( pi_paths.length > 0 ) {
                    this._getPITreeStore(pi_paths);
                }
            },
            failure: function(error) {
                this.down('#message_box').update(error);
            }
        });
    },
    _getPortfolioItemNames:function() {
        var deferred = Ext.create('Deft.Deferred');

        this.calculate_story_field_name = this.getSetting('calculate_story_field_name');
        this.calculate_defect_field_name = this.getSetting('calculate_defect_field_name');
        this.calculate_original_field_name = this.getSetting('calculate_original_field_name');
        this.include_defects_under_stories = false;
        this.include_defects_under_pis = this.getSetting('include_defects');;
        this.defect_link_field = this.getSetting('defect_link_field');

        this.logger.log("Settings: ", this.getSettings());
        
        if ( this._needsSettings() ) {
            deferred.reject("Select 'Edit App Settings' from the gear menu to configure fields to use for calculations");
        } else {
            Ext.create('Rally.data.wsapi.Store',{
                model:'TypeDefinition',
                filters: [{property:'TypePath',operator:'contains',value:'PortfolioItem/'}],
                sorters: [{property:'Ordinal',direction:'Desc'}],
                autoLoad: true,
                listeners: {
                    scope: this,
                    load: function(store,records){
                        var pi_names = [];
                        Ext.Array.each(records,function(record){
                            pi_names.push(Ext.util.Format.lowercase(record.get('TypePath')));
                        });

                        deferred.resolve(pi_names);
                    }
                }
            });
        }
        return deferred.promise;
    },
    _needsSettings: function() {
        if ( typeof(this.calculate_story_field_name) == 'undefined' ) {
            this.logger.log("Missing field on story" ) ;
            return true;
        }
        if ( typeof(this.calculate_defect_field_name) == 'undefined' ) {
            this.logger.log("Missing field on defect");
            return true;
        } 
        if ( typeof(this.calculate_original_field_name) == 'undefined' && this.include_defects_under_pis ) {
            this.logger.log("Missing original value field");
            return true;
        } 
        return false;
  
    },
    _mask: function(message){
        this.logger.log("Mask: ", message);
        if ( this.sparkler ) { this.sparkler.destroy(); }
        this.sparkler = new Ext.LoadMask(this, {msg:message});  
        this.sparkler.show();
    },
    _unmask: function() {
        if ( this.sparkler ) { this.sparkler.hide(); }
    },
    _getFieldsToFetch: function() {
        var me = this;
        var fields_to_fetch =  ['FormattedID','Name', 'State','Children',this.calculate_original_field_name,
            'PlannedStartDate','PlannedEndDate','DirectChildrenCount',
            'AcceptedDate','ScheduleState','Defects',this.calculate_story_field_name, this.calculate_defect_field_name];

        var additional_fields = this.getSetting('additional_fields_for_pis');
        
        if ( typeof(additional_fields) == "string" ) {
            additional_fields = additional_fields.split(',');
        }
        
        Ext.Array.each(additional_fields, function(field) {
            if ( typeof(field) == 'object' ) {
                fields_to_fetch.push(field.get('name'));
            } else {
                fields_to_fetch.push(me._getFieldNameFromDisplay(field));
            }
        });
        
        if ( this.defect_link_field ) {
            fields_to_fetch.push(this.defect_link_field);
        }
        return fields_to_fetch;
    },
    _getFieldNameFromDisplay: function(field_name) {
        return field_name.replace(/ /g, "");
    },
    _getFieldDisplayFromName: function(field_name){
        var str = field_name.replace(/^c_/,"");
        
        return str.replace( /(^[a-z]+)|[0-9]+|[A-Z][a-z]+|[A-Z]+(?=[A-Z][a-z]|[0-9])/g, function(match, first){ 
            if (first) {
                match = match[0].toUpperCase() + match.substr(1);
            }
            return match + ' ';
        });
    },
    _getPITreeStore: function(pi_paths) {
        var me = this;
        this.logger.log("_getPITreeStore",pi_paths);
        this._mask("Gathering Portfolio Item data...");
        
        var filters = [{property:'ObjectID',operator:'>',value:0}];
        
        var pi_filter_field = this.getSetting('pi_filter_field');
        var pi_filter_value = this.getSetting('pi_filter_value');

        if ( pi_filter_field && pi_filter_value && pi_filter_value != "-1" ) {
            filters = [{property:pi_filter_field,value:pi_filter_value}];
        }
        Ext.create('Rally.data.wsapi.Store', {
            model: pi_paths[0],
            filters: filters,
            autoLoad: true,
            fetch:me._getFieldsToFetch(),
            listeners: {
                scope: this,
                load: function(store, top_pis, success) {
                    if ( top_pis.length === 0 ) {
                        this.down('#message_box').add({
                            xtype:'container',
                            html:'Cannot find a ' + pi_paths[0] + ' that matches the criteria'
                        });
                        this._unmask();
                    } else {
                        var top_pi_hashes = [];
                        var promises = [];
                        Ext.Array.each(top_pis,function(top_pi){
                            var pi_data = top_pi.getData();
                            pi_data.__original_value = top_pi.get(me.calculate_original_field_name);
                            pi_data.leaf = true;
                            if ( top_pi.get('Children') && top_pi.get('Children').Count > 0 ) {
                                pi_data.leaf = false;
                                pi_data.expanded = false;
                                pi_data.__is_top_pi = true;
                                promises.push( me._getChildren(pi_data,pi_paths) );
                            }
                            if (  me.include_defects_under_pis ) {
                                promises.push(me._getDefectsForPI(pi_data,pi_paths));
                            }
                            top_pi_hashes.push(pi_data);
                        });
                        
                        
                        // extend the model to add additional fields
                        var additional_fields = this.getSetting('additional_fields_for_pis');
                        if ( typeof(additional_fields) == "string" ) {
                            additional_fields = additional_fields.split(',');
                        }
                        
                        var fields = [];
                        Ext.Array.each(additional_fields, function(field) {
                            me.logger.log("Making model with field: ",field);
                            if ( typeof(field) == 'object' ) {
                                fields.push(me._getFieldNameFromDisplay(field.get('name')));
                            } else {
                                fields.push(me._getFieldNameFromDisplay(field));
                            }
                        });
                            
                        var model = {
                            extend: 'TSTreeModel',
                            fields: fields
                        };
                        
                        me.logger.log("Made a model using these fields: ", fields);
                        
                        Ext.define('TSTreeModelWithAdditions', model);
                        
                        Deft.Promise.all(promises).then({
                            scope: this,
                            success: function(node_hashes){
                                this._mask("Structuring Data into Tree...");
                                this.logger.log(top_pi_hashes);
                                var tree_store = Ext.create('Ext.data.TreeStore',{
                                    model: TSTreeModelWithAdditions,
                                    root: {
                                        expanded: false,
                                        children: top_pi_hashes
                                    }
                                });
                                this._addTreeGrid(tree_store,top_pi_hashes);
                            },
                            failure:function (error) {
                                alert(error);
                            }
                        });
                    }
                }
            }
        });
    },
    _getDefectsForPI: function(node_hash,pi_paths){
        var deferred = Ext.create('Deft.Deferred');
        this._mask("Gathering Defects...");
        this.logger.log('_getDefectsForPI ', this.defect_link_field, node_hash);
        var link = node_hash[this.defect_link_field];
        
        if (link) {
            var defect_node_hash = {
                leaf: true,
                expanded: false,
                FormattedID:'',
                Name: 'Defects'
            };
            
            if ( !node_hash.children ) {
                node_hash.children = [];
            }
            
            Ext.create('Rally.data.wsapi.Store',{
                model: 'Defect',
                filters: [
                    { property: this.defect_link_field, value: node_hash[this.defect_link_field] }
                ],
                fetch: this._getFieldsToFetch(),
                context: { project: null },
                autoLoad: true,
                listeners: {
                    scope: this,
                    load: function(store, records) {
                        var total_rollup = 0;
                        var child_hashes = [];
                        if ( records.length > 0 ) {
                            defect_node_hash.leaf = false;
                            node_hash.leaf = false;
                        }
                        Ext.Array.each(records,function(record){
                            var record_data = record.getData();
                            record_data.leaf = true;
                            
                            // set value for calculating field
                            record_data.__rollup_defect = record.get(this.calculate_defect_field_name);
                            this.logger.log("DEFECT ", this.calculate_defect_field_name, record);
                            if ( this._isAccepted(record_data) && this._isClosed(record_data )) {
                                record_data.__accepted_rollup_defect = record.get(this.calculate_defect_field_name);
                            }
                            child_hashes.push(record_data);
                        }, this);
                        
                        if ( !defect_node_hash.children ) {
                            defect_node_hash.children = [];
                        }
                        defect_node_hash.children = Ext.Array.push(defect_node_hash.children,child_hashes);
                        
                        defect_node_hash.__rollup_defect = this._calculateRollup(defect_node_hash,child_hashes,'__rollup_defect');
                        defect_node_hash.__accepted_rollup_defect = this._calculateRollup(defect_node_hash,child_hashes,'__accepted_rollup_defect');

                        node_hash.children = Ext.Array.push(node_hash.children,[defect_node_hash]);
                        node_hash.__rollup_defect = this._calculateRollup(node_hash,node_hash.children,'__rollup_defect');
                        node_hash.__accepted_rollup_defect = this._calculateRollup(node_hash,node_hash.children,'__accepted_rollup_defect');

                        
                        deferred.resolve();
                    }

                }
            });
        } else {
            this.logger.log("No defect link for ", node_hash.FormattedID);
            deferred.resolve();
        }
        
        return deferred;
    },
    _getChildren:function(node_hash,pi_paths) {
        var deferred = Ext.create('Deft.Deferred');
        var me = this;
        this._mask("Gathering Descendant Information...");
        Ext.create('Rally.data.wsapi.Store',{
            model: this._getChildModelForItem(node_hash,pi_paths),
            filters: [
                this._getChildFilterForItem(node_hash,pi_paths)
            ],
            fetch: this._getFieldsToFetch(),
            context: { project: null },
            autoLoad: true,
            listeners: {
                scope: this,
                load: function(store, records) {
                    var child_hashes = [];
                    var promises = [];
                    var total_rollup = 0;
                    Ext.Array.each(records,function(record){
                        var record_data = record.getData();
                        record_data.leaf = true;

                        if ( record.get('Children') && record.get('Children').Count > 0 ) {
                            record_data.leaf = false;
                            record_data.expanded = false;
                            promises.push( me._getChildren(record_data,pi_paths) );
                        } else if ( record.get('DirectChildrenCount') && record.get('DirectChildrenCount') > 0)  {
                            record_data.leaf = false;
                            record_data.expanded = false;
                            promises.push( me._getChildren(record_data,pi_paths) );
                        }
                        
                        if ( me.include_defects_under_stories && record.get('Defects') && record.get('Defects').Count > 0 ) {
                            record_data.leaf = false;
                            promises.push( me._getDefects(record_data) );
                        }
                        
                        // set value for calculating field
                        record_data.__rollup_story = record.get(me.calculate_story_field_name);
                        if ( me._isAccepted(record_data) ) {
                            record_data.__accepted_rollup_story = record.get(me.calculate_story_field_name);
                        }
                        child_hashes.push(record_data);
                    });
                    
                    if ( !node_hash.children ) {
                        node_hash.children = [];
                    }
                    node_hash.children = Ext.Array.push(node_hash.children,child_hashes);
                    
                    if ( promises.length > 0 ) {
                        Deft.Promise.all(promises).then({
                            scope: this,
                            success: function(records){
                                node_hash.__rollup_story = this._calculateRollup(node_hash,child_hashes,'__rollup_story');
                                node_hash.__accepted_rollup_story = this._calculateRollup(node_hash,child_hashes,'__accepted_rollup_story');
                                node_hash.__rollup_defect = this._calculateRollup(node_hash,child_hashes,'__rollup_defect');
                                node_hash.__accepted_rollup_defect = this._calculateRollup(node_hash,child_hashes,'__accepted_rollup_defect');
                                deferred.resolve(node_hash);
                            },
                            failure: function(error) {
                                deferred.reject(error);
                            }
                        });
                    } else {
                        node_hash.__rollup_story = this._calculateRollup(node_hash,child_hashes,'__rollup_story');
                        node_hash.__accepted_rollup_story = this._calculateRollup(node_hash,child_hashes,'__accepted_rollup_story');
                        node_hash.__rollup_defect = this._calculateRollup(node_hash,child_hashes,'__rollup_defect');
                        node_hash.__accepted_rollup_defect = this._calculateRollup(node_hash,child_hashes,'__accepted_rollup_defect');
                        deferred.resolve();
                    }
                }
            }
        });
        return deferred.promise;
    },
    _getDefects:function(node_hash) {
        var deferred = Ext.create('Deft.Deferred');
        var me = this;
        Ext.create('Rally.data.wsapi.Store',{
            model: 'Defect',
            filters: [
                this._getDefectFilterForItem(node_hash)
            ],
            fetch: this._getFieldsToFetch(),
            context: { project: null },
            autoLoad: true,
            listeners: {
                scope: this,
                load: function(store, records) {
                    var total_rollup = 0;
                    var child_hashes = [];
                    Ext.Array.each(records,function(record){
                        var record_data = record.getData();
                        record_data.leaf = true;
                        
                        // set value for calculating field
                        //record_data.__rollup = record.get(me.calculate_defect_field_name);
                        record_data.__rollup_defect = record.get(me.calculate_defect_field_name);
                        me.logger.log("DEFECT ", me.calculate_defect_field_name, record);
                        if ( me._isAccepted(record_data) && me._isClosed(record_data )) {
                            record_data.__accepted_rollup_defect = record.get(me.calculate_defect_field_name);
                        }
                        child_hashes.push(record_data);
                    });
                    if ( !node_hash.children ) {
                        node_hash.children = [];
                    }
                    node_hash.children = Ext.Array.push(node_hash.children,child_hashes);
                    
//                    node_hash.__rollup_story = this._calculateRollup(node_hash,child_hashes,'__rollup_story');
//                    node_hash.__accepted_rollup_story = this._calculateRollup(node_hash,child_hashes,'__accepted_rollup');
                    node_hash.__rollup_defect = this._calculateRollup(node_hash,child_hashes,'__rollup_defect');
                    node_hash.__accepted_rollup_defect = this._calculateRollup(node_hash,child_hashes,'__accepted_rollup_defect');
                    deferred.resolve();
                }
            }
        });
        return deferred.promise;
    },
    _isClosed: function(record_data) {
        var closed = false; 
        if ( record_data.AcceptedDate !== null && record_data.State === "Closed" ) {
            closed = true;
        }
        return closed;
    },
    _isAccepted: function(record_data) {
        var accepted = false; 
        if ( record_data.AcceptedDate !== null ) {
            accepted = true;
        }
        return accepted;
    },
    _calculateRollup: function(node_hash,child_hashes,field_name) {
        var me = this;
        this._mask("Calculating Rollup with " + field_name + "...");
        // roll up the data
        var total_rollup = 0;
        /*
         * when a story has only defects, it might be that we want to add its 
         * value to the defects' values
         * but when the defect has children and defects, we want only the children+defects
         */
        var original_value = node_hash[field_name] || 0;
        var has_child_stories = false;
        this.logger.log("calculating rollup for ", node_hash.FormattedID, node_hash);
        Ext.Array.each(child_hashes,function(child){
            var rollup_value = child[field_name] || 0;
            me.logger.log(" ----- ", rollup_value);
            total_rollup += rollup_value;
            if ( child._type === "hierarchicalrequirement" ) {
                has_child_stories = true;
            }
        });
        
        if ( !has_child_stories ) {
            total_rollup += original_value;
        }
        
        return total_rollup;
    },
    _getColumns: function() {
        var me = this;
        me.logger.log("_getColumns");
        
        var name_renderer = function(value,meta_data,record) {
            return me._nameRenderer(value,meta_data,record);
        };
        
        var columns = [
            {
                xtype: 'treecolumn',
                text: TSGlobals.tree_header,
                dataIndex: 'Name',
                itemId: 'tree_column',
                renderer: name_renderer,
                width: this.getSetting('tree_column') || 200
            },
            {
                dataIndex: '__original_value',
                text: TSGlobals.original_pert_header,
                itemId:'original_pert_column',
                showTotal: true,
                width: this.getSetting('original_pert_column') || 100,
                menuDisabled: true
            },
            {
                dataIndex: '__progress_by_original',
                text: TSGlobals.progress_by_original_header,
                itemId: 'progress_by_original_column',
                width: this.getSetting('progress_by_original_column') || 100,
                renderer: function(value,meta_data,record) {
                    if ( record.get('__is_top_pi') ) {
                        return Ext.create('Rally.technicalservices.ProgressBarTemplate',{
                            numeratorField: '__accepted_rollup',
                            denominatorField: '__original_value',
                            percentDoneName: '__original_value'
                        }).apply(record.getData());
                    } else {
                        return "";
                    }
                    
                },
                menuDisabled: true
            },
            {
                dataIndex: '__progress_by_rollup',
                text: TSGlobals.progress_by_rollup_header,
                itemId: 'progress_rollup_column',
                width: this.getSetting('progress_rollup_column') || 100,
                renderer: function(value,meta_data,record) {
                    return Ext.create('Rally.technicalservices.ProgressBarTemplate',{
                        numeratorField: '__accepted_rollup',
                        denominatorField: '__rollup',
                        percentDoneName: '__rollup'
                    }).apply(record.getData());
                    
                },
                menuDisabled: true
            },
            {
                dataIndex: '__rollup_story',
                text: TSGlobals.total_rollup_story_header,
                showTotal: true,
                itemId:'total_rollup_story_column',
                width: this.getSetting('total_rollup_story_column') || 100,
                renderer: Ext.util.Format.numberRenderer('0.00'),
                menuDisabled: true
            },
            {
                dataIndex: '__accepted_rollup_story',
                text: TSGlobals.pert_completed_story_header,
                showTotal: true,
                itemId:'pert_completed_story_column',
                width: this.getSetting('pert_completed_story_column') || 100,
                renderer: Ext.util.Format.numberRenderer('0.00'),
                menuDisabled: true
            },
            {
                dataIndex: '__calculated_remaining_story',
                text: TSGlobals.pert_remaining_story_header,
                showTotal: true,
                itemId:'pert_remaining_story_column',
                width: this.getSetting('pert_remaining_story_column') || 100,
                renderer: function(value,meta_data,record){
                    return Ext.util.Format.number(value, '0.00');
                },
                menuDisabled: true
            },
            {
                dataIndex: '__calculated_remaining_defect',
                text: TSGlobals.pert_remaining_defect_header,
                itemId:'pert_remaining_defect_column',
                showTotal: true,
                width: this.getSetting('pert_remaining_defect_column') || 100,
                renderer: function(value,meta_data,record){
                    return Ext.util.Format.number(value, '0.00');
                },
                menuDisabled: true
            },
            {
                dataIndex: '__calculated_remaining',
                text: TSGlobals.pert_remaining_header,
                itemId:'pert_remaining_column',
                showTotal: true,
                width: this.getSetting('pert_remaining_column') || 100,
                renderer: function(value,meta_data,record){
                    return Ext.util.Format.number(value, '0.00');
                },
                menuDisabled: true
            },
            {
                dataIndex: '__calculated_accepted_delta',
                text: TSGlobals.accepted_delta_header,
                showTotal: true,
                itemId:'accepted_delta_column',
                width: this.getSetting('accepted_delta_column') || 100,
                renderer: function(value,meta_data,record){
                    if ( value > 0 ) {
                        meta_data.style = "color: red";
                    } else if ( value < 0 ) {
                        meta_data.style = "color: blue";
                    }
                    return Ext.util.Format.number(value, '0.00');
                },
                menuDisabled: true
            },
            {
                dataIndex: '__calculated_total_delta',
                text: TSGlobals.total_delta_header,
                showTotal: true,
                itemId:'total_delta_column',
                width: this.getSetting('total_delta_column') || 100,
                renderer: function(value,meta_data,record){
                    if ( value > 0 ) {
                        meta_data.style = "color: red";
                    } else if ( value < 0 ) {
                        meta_data.style = "color: blue";
                    }
                    return Ext.util.Format.number(value, '0.00');
                },
                menuDisabled: true
            }];
        
        if ( this.include_defects_under_stories || this.include_defects_under_pis ) {
            columns.push({
                dataIndex: '__rollup_defect',
                text: TSGlobals.total_rollup_defect_header,
                itemId:'total_rollup_defect_column',
                showTotal: true,
                width: this.getSetting('total_rollup_defect_column') || 100,
                renderer: Ext.util.Format.numberRenderer('0.00'),
                menuDisabled: true
            });
            columns.push({
                dataIndex: '__accepted_rollup_defect',
                text: TSGlobals.pert_completed_defect_header,
                showTotal: true,
                itemId:'pert_completed_defect_column',
                width: this.getSetting('pert_completed_defect_column') || 100,
                renderer: Ext.util.Format.numberRenderer('0.00'),
                menuDisabled: true
            });
        }
        
        columns.push({
            dataIndex: '__rollup',
            text: TSGlobals.total_rollup_header,
            itemId:'total_rollup_column',
                showTotal: true,
            width: this.getSetting('total_rollup_column') || 100,
            renderer: Ext.util.Format.numberRenderer('0.00'),
            menuDisabled: true
        });
        columns.push({
            dataIndex: '__accepted_rollup',
            text: TSGlobals.pert_completed_header,
                showTotal: true,
            itemId:'pert_completed_column',
            width: this.getSetting('pert_completed_column') || 100,
            renderer: Ext.util.Format.numberRenderer('0.00'),
            menuDisabled: true
        });
        
        
        
        var additional_fields = this.getSetting('additional_fields_for_pis');
        if ( typeof(additional_fields) == "string" ) {
            additional_fields = additional_fields.split(',');
        }
        Ext.Array.each( additional_fields, function(additional_field){
            var column_header = additional_field;
            var column_index = additional_field;

            if ( typeof(additional_field) == 'object' ) {
                column_header = additional_field.get('displayName');
                column_index = additional_field.get('name');
            } 
            column_index = me._getFieldNameFromDisplay(column_index);
            column_header = me._getFieldDisplayFromName(column_header);
            
            var additional_column = {
                dataIndex: column_index,
                text: column_header,
                itemId:column_index + '_column',
                width: me.getSetting(column_index + '_column') || 100,
                menuDisabled: true
            };
            
            additional_column.renderer = function(value) {
                if ( typeof(value) == "object" ) {
                    if ( ! value ) { return ""; }
                    
                    return value._refObjectName;
                } 
                return value;
            };
            columns.push(additional_column);
        });
        me.logger.log("Making Columns ", columns);
        
        return me._arrangeColumns(columns);
    },
    _arrangeColumns: function(columns) {
        var arranged_columns = [];
        var column_order_string = this.getSetting("column_order");
        
        this.logger.log("Arranging columns as ", column_order_string );
        if ( column_order_string ) {
            var column_order_array = column_order_string.split(',');
            // cycle through the setting for the order of columns by name
            // then find each column in the built array to push them
            Ext.Array.each(column_order_array,function(column_name){
                Ext.Array.each(columns,function(column){
                    if ( column.itemId == column_name ) {
                        arranged_columns.push(column);
                    }
                });
            });
            // Add in columns not yet ordered (because they've been added since the last time
            // we re-ordered, maybe
            Ext.Array.each(columns,function(column){
                if ( Ext.Array.indexOf(column_order_string,column.itemId) == -1 ) {
                    arranged_columns.push(column);
                }
            });
        } else {
            arranged_columns = columns;
        }
        
        return arranged_columns;
    },
    _addTreeGrid: function(tree_store,top_pi_hashes) {
        this.logger.log("creating TreeGrid");
        var me = this;
        this._unmask();
        
        var columns = this._getColumns();

        Ext.Array.each(columns,function(column){
            var total = 0;
            if ( column.showTotal ) {
                Ext.Array.each(top_pi_hashes, function(pi){
                    var pi_model = Ext.create(TSTreeModel,pi); // convert so calculations happen
                    
                    var value = pi_model.get(column.dataIndex) || 0;
                    
                    total = total + value;
                },this);
                column.text = column.text + " [" + Ext.util.Format.number(total,'0.00') + "]";
            }
        },this);

        
        var pi_tree = this.down('#display_box').add({
            xtype:'treepanel',
            store: tree_store,
            cls: 'rally-grid',
            rootVisible: false,
            enableColumnMove: true,
            rowLines: true,
            viewConfig : {
                stripeRows : true
            },
            listeners: {
                scope: this,
                columnresize: this._saveColumnSizes,
                columnmove: this._saveColumnPositions
            },
            columns: columns
        });
        
        this._addButton(pi_tree);
    },
    _saveColumnPositions: function(header_container,column,fromIdx,toIdx) {
        this.logger.log("change column position", header_container);
        this.logger.log("columns:", header_container.getGridColumns( true ));
        var column_order = [];
        Ext.Array.each(header_container.getGridColumns( true ), function(column){
            column_order.push(column.itemId);
        });
        this.logger.log("Saving column order:",column_order);
        var settings = {};
        settings["column_order"] = column_order;
        
        this.updateSettingsValues({
            settings: settings
        });
    },
    _saveColumnSizes: function(header_container,column,width){
        this.logger.log("change column size", header_container,column.itemId, width);
        var settings = {};
        settings[column.itemId] = width;
        
        this.updateSettingsValues({
            settings: settings
        });
    },
    _nameRenderer: function(value,meta_data,record) {
        var display_value = record.get('Name');
        if ( record.get('FormattedID') ) {
            var link_text = record.get('FormattedID') + ": " + value;
            var url = Rally.nav.Manager.getDetailUrl( record );
            display_value = "<a target='_blank' href='" + url + "'>" + link_text + "</a>";
        }
        return display_value;
    },
    _getChildModelForItem: function(node_hash,pi_paths){
        var parent_model = Ext.util.Format.lowercase(node_hash._type);
        var child_type = "PortfolioItem";
        
        if ( Ext.Array.indexOf(pi_paths,parent_model) == pi_paths.length - 1 ) {
            child_type = 'HierarchicalRequirement';
        } else if (Ext.Array.indexOf(pi_paths,parent_model) == - 1)  {
            child_type = 'HierarchicalRequirement';
        }
        
        return child_type;
    },
    _getChildFilterForItem: function(node_hash,pi_paths){
        var parent_model = Ext.util.Format.lowercase(node_hash._type);
        var child_filter = { property:'Parent.ObjectID', value: node_hash.ObjectID };
        
        if ( Ext.Array.indexOf(pi_paths,parent_model) == pi_paths.length - 1 ) {
            child_filter = { property:'PortfolioItem.ObjectID', value: node_hash.ObjectID };
        }
        
        return child_filter;
    },
    _getDefectFilterForItem: function(node_hash){
        var child_filter = { property:'Requirement.ObjectID', value: node_hash.ObjectID };
        
        return child_filter;
    },
    _ignoreTextFields: function(field) {
        var should_show_field = true;
        var forbidden_fields = ['FormattedID','ObjectID','DragAndDropRank','Name'];
        if ( field.hidden ) {
            should_show_field = false;
        }
        
        if ( field.attributeDefinition ) {
            
            var type = field.attributeDefinition.AttributeType;
            if ( type == "TEXT" || type == "OBJECT" || type == "COLLECTION" ) {
                should_show_field = false;
            }
            if ( field.name == "Owner" ) {
                should_show_field = true;
            }
            if ( field.name == "c_SOWReference") {
                should_show_field = true;
            }
            if ( Ext.Array.indexOf(forbidden_fields,field.name) > -1 ) {
                should_show_field = false;
            }
        } else {
            should_show_field = false;
        }
        return should_show_field;
    },
    _chooseOnlyNumberFields: function(field){
        var should_show_field = true;
        var forbidden_fields = ['FormattedID','ObjectID'];
        if ( field.hidden ) {
            should_show_field = false;
        }
        
        if ( field.attributeDefinition ) {
            var type = field.attributeDefinition.AttributeType;
            
            if ( type != "QUANTITY" && type != "INTEGER" && type != "DECIMAL"  ) {
                should_show_field = false;
            }
            if ( Ext.Array.indexOf(forbidden_fields,field.name) > -1 ) {
                should_show_field = false;
            }
        } else {
            should_show_field = false;
        }
        return should_show_field;
    },
    _ignoreNonDropdownFields: function(field){
        var should_show_field = true;
        var forbidden_fields = ['FormattedID','ObjectID',
            'DragAndDropRank','Name', 'Attachments', 'Changesets',
            'Discussion', 'Project', 'RevisionHistory',
            'Subscription','Workspace', 'PortfolioItemType',
            'State'];
        if ( field.hidden ) {
            should_show_field = false;
        }
        if ( field.attributeDefinition ) {
            var type = field.attributeDefinition.AttributeType;
            var allowed_values_type = field.attributeDefinition.AllowedValueType;
            var allowed_values = field.attributeDefinition.AllowedValues;
            var xtype = null;
            var editor = field.editor;
            if ( editor ) {
                xtype = editor.xtype;
            }
            
            //console.log( field.name, allowed_values_type, typeof(allowed_values), field);
            
            if ( xtype != "rallyfieldvaluecombobox" ) {
                should_show_field = false;
            }
            
            if ( Ext.Array.indexOf(forbidden_fields,field.name) > -1 ) {
                should_show_field = false;
            }
        } else {
            should_show_field = false;
        }
        return should_show_field;
    },
    getSettingsFields: function() {
        var _chooseOnlyNumberFields = this._chooseOnlyNumberFields;
        var _ignoreTextFields = this._ignoreTextFields;
        var _ignoreNonDropdownFields = this._ignoreNonDropdownFields;
        
        var container_box = { xtype:'container', layout: {type:'hbox'} };
        
        var left_box = { xtype:'container', layout: {type:'vbox'}, margin: 5};
        var right_box = { xtype:'container', layout: {type:'vbox'}, margin: 5 };
        
        left_box.items = [
            {
                name: 'calculate_original_field_name',
                xtype: 'rallyfieldcombobox',
                model: 'PortfolioItem',
                fieldLabel: 'Original PERT Field',
                _isNotHidden: _chooseOnlyNumberFields,
                width: 300,
                labelWidth: 150,
                readyEvent: 'ready' //event fired to signify readiness
            },
            {
                name: 'calculate_story_field_name',
                xtype: 'rallyfieldcombobox',
                model: 'HierarchicalRequirement',
                fieldLabel: 'Story PERT Field',
                width: 300,
                labelWidth: 150,
                _isNotHidden: _chooseOnlyNumberFields,
                readyEvent: 'ready' //event fired to signify readiness
            },
            {
                name: 'calculate_defect_field_name',
                xtype: 'rallyfieldcombobox',
                model: 'Defect',
                fieldLabel: 'Defect PERT Field',
                width: 300,
                labelWidth: 150,
                _isNotHidden: _chooseOnlyNumberFields,
                readyEvent: 'ready' //event fired to signify readiness
            },
            {
                name: 'include_defects',
                xtype: 'rallycheckboxfield',
                fieldLabel: 'Show Defects',
                width: 300,
                labelWidth: 150,
                readyEvent: 'ready'
            },
            {
                name: 'defect_link_field',
                xtype: 'rallyfieldcombobox',
                model: 'PortfolioItem',
                fieldLabel: 'Field to Connect Defects:',
                _isNotHidden: _ignoreTextFields,
                width: 300,
                labelWidth: 150,
                readyEvent: 'ready' //event fired to signify readiness
            },
            {
                name: 'pi_filter_field',
                xtype:'rallyfieldcombobox',
                model:'PortfolioItem',
                fieldLabel: 'Field for Filtering:',
                _isNotHidden: _ignoreNonDropdownFields,
                width: 300,
                labelWidth: 150,
                readyEvent:'ready',
                listeners: {
                    setvalue: function() {                        
                        var outer_box = this.ownerCt;
                        if ( outer_box && outer_box.down('#pi_filter_value') ) {
                            outer_box.down('#pi_filter_value').destroy();
                        }
                        if ( outer_box && outer_box.down('#pi_filter_value') ) {
                            outer_box.down('#pi_filter_value').destroy();
                        }
                        if ( this.getValue() && this.getValue() !== null ) {
                            outer_box.add({
                                name: 'pi_filter_value',
                                itemId:'pi_filter_value',
                                xtype:'rallyfieldvaluecombobox',
                                allEntryText: '-- ALL --',
                                allowNoEntry: true,
                                _insertNoEntry: function(){
                                    var record;
                                    var doesNotHaveAllEntry = this.store.count() < 1 || this.store.getAt(0).get(this.displayField) !== this.allEntrylText;
                                    if (doesNotHaveAllEntry) {
                                        record = Ext.create(this.store.model);
                                        record.set(this.displayField, this.allEntryText);
                                        record.set(this.valueField, "-1");
                                        this.store.insert(0, record);
                                    }
                                    var doesNotHaveNoEntry = this.store.count() < 2 || this.store.getAt(1).get(this.displayField) !== this.noEntryText;
                                    if (doesNotHaveNoEntry) {
                                        record = Ext.create(this.store.model);
                                        record.set(this.displayField, this.noEntryText);
                                        record.set(this.valueField, null);
                                        this.store.insert(1, record);
                                    }
                                },
                                width: 300,
                                labelWidth: 150,
                                model: 'PortfolioItem',
                                field: this.getValue(),
                                fieldLabel: 'Filter on: '
                            });
                        }
                    }
                }
            },
            {
                name: 'pi_filter_value',
                itemId:'pi_filter_value',
                xtype:'label',
                width: 300,
                labelWidth: 150,
                model: 'PortfolioItem',
                field: 'Owner',
                fieldLabel: ' ',
                readyEvent:'ready'
            }
        ];
        
        right_box.items= [
            {
                name: 'additional_fields_for_pis',
                xtype: 'rallyfieldpicker',
                modelTypes: ['PortfolioItem'],
                fieldLabel: 'Additional fields for Portfolio Items:',
                _shouldShowField: _ignoreTextFields,
                width: 300,
                labelWidth: 150,
                listeners: {
                    ready: function(picker){ picker.collapse(); }
                },
                readyEvent: 'ready' //event fired to signify readiness
            }
        ];
        
        container_box.items = [ left_box, right_box ];
        
        return [ container_box ];
    },
    _setSettingsFromComponents: function(cmp,fields){
        for ( var i=0; i<fields.length; i++ ) {
            var field = fields[i];
            if ( field.xtype == 'container' ) {
                this._setSettingsFromComponents(cmp,field.items);
            } else {
                this.settings[field.name] = cmp.up('rallydialog').down('[name="' + field.name + '"]').getValue();
            }
        }
        return true;
    },
    // ONLY FOR RUNNING EXTERNALLY
    _showExternalSettingsDialog: function(fields){
        var me = this;
        if ( this.settings_dialog ) { this.settings_dialog.destroy(); }
        this.settings_dialog = Ext.create('Rally.ui.dialog.Dialog', {
             autoShow: false,
             draggable: true,
             width: 400,
             title: 'Settings',
             buttons: [{ 
                scope: this,
                text: 'OK',
                handler: function(cmp){
                    this.settings = {};
                    this._setSettingsFromComponents(cmp,fields);
                    
                    cmp.up('rallydialog').destroy();
                    this._getData();
                }
            }],
             items: [
                {xtype:'container',html: "&nbsp;", padding: 5, margin: 5},
                {xtype:'container',itemId:'field_box', padding: 5, margin: 5}]
         });
         Ext.Array.each(fields,function(field){
            me.settings_dialog.down('#field_box').add(field);
         });
         this.settings_dialog.show();
    },
    resizeIframe: function() {
        var iframeContentHeight = 400;    
        var container = window.frameElement.parentElement;
        if (container != parent.document.body) {
            container.style.height = iframeContentHeight + 'px';
        }
        window.frameElement.style.height = iframeContentHeight + 'px';
        return;
    },
    _isAbleToDownloadFiles: function() {
        try { 
            var isFileSaverSupported = !!new Blob(); 
        } catch(e){
            this.logger.log(" NOTE: This browser does not support downloading");
            return false;
        }
        return true;
    },
    _getCSVFromChildren: function(node,column_names){
        var csv = [];
        node.eachChild(function(child){
            var node_values = [];
            Ext.Array.each(column_names,function(column_name){
                node_values.push(this._getValueFromNode(child,column_name));
            },this);
            csv.push('"' + node_values.join('","') + '"');
        },this);
        return csv;
    },
    _isAPercentageColumn:function(column_name) {
        return /__progress/.test(column_name);
    },
    _getValueFromNode: function(node,column_name){
        var value = node.get(column_name);
        
        if ( value && typeof(value) == "object" ) {
            value = value._refObjectName;
        }
        if ( this._isAPercentageColumn(column_name) ) {
            value = parseFloat(value,10) || 0;
            value = Ext.util.Format.number(value * 100,'0.00');
        } 
        return value;
        
    },
    _getCSVFromTree:function(tree){
        var columns = tree.columns;
        var column_names = [];
        var headers = [];
        
        var csv = [];

        Ext.Array.each(columns,function(column){
            column_names.push(column.dataIndex);
            headers.push(column.text);
        });
        csv.push('"' + headers.join('","') + '"');
        
        var root = tree.getStore().getRootNode();
        root.eachChild(function(child){
            var node_values = [];
            Ext.Array.each(column_names,function(column_name){
                node_values.push(this._getValueFromNode(child,column_name));
            },this);
            csv.push('"' + node_values.join('","') + '"');
            var child_csv = this._getCSVFromChildren(child,column_names);
            csv = Ext.Array.push(csv, child_csv);
        },this);
        
        return csv.join('\r\n');
    },
    _saveCSVToFile:function(csv,file_name,type_object){
        var blob = new Blob([csv],type_object);
        saveAs(blob,file_name);
    }

});
