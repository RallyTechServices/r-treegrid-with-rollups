Ext.define('CustomApp', {
    extend: 'Rally.app.App',
    componentCls: 'app',
    logger: new Rally.technicalservices.Logger(),
    rollup_field: 'PERT',
    items: [
        {xtype:'container',itemId:'display_box'},
        {xtype:'tsinfolink'}
    ],
    launch: function() {
        this._getPortfolioItemNames().then({
            scope: this,
            success: function(pi_paths) {
                if ( pi_paths.length > 0 ) {
                    this._getPITreeStore(pi_paths);
                }
            },
            failure: function(error) {
                alert(error);
            }
        });
    },
    _getPortfolioItemNames:function() {
        var deferred = Ext.create('Deft.Deferred');
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
        return deferred.promise;
    },
    _getPITreeStore: function(pi_paths) {
        var me = this;
        this.logger.log("_getPITreeStore",pi_paths);
        Ext.create('Rally.data.wsapi.Store', {
            model: pi_paths[0],
            autoLoad: true,
            listeners: {
                scope: this,
                load: function(store, top_pis, success) {
                    var top_pi_hashes = [];
                    var promises = [];
                    
                    Ext.Array.each(top_pis,function(top_pi){
                        var pi_data = top_pi.getData();
                        pi_data.leaf = true;
                        if ( top_pi.get('Children') && top_pi.get('Children').Count > 0 ) {
                            pi_data.leaf = false;
                            pi_data.expanded = true;
                            promises.push( me._getChildren(pi_data,pi_paths) );
                        }
                        top_pi_hashes.push(pi_data);
                    });
                    Deft.Promise.all(promises).then({
                        scope: this,
                        success: function(node_hashes){
                            var tree_store = Ext.create('Ext.data.TreeStore',{
                                model: TSTreeModel,
                                root: {
                                    expanded: true,
                                    children: top_pi_hashes
                                }
                            });
                            this._addTreeGrid(tree_store);
                        },
                        failure:function (error) {
                            alert(error);
                        }
                    });
                    
                }
            },
            fetch: ['FormattedID','Name', 'State','Children']
        });
    },
    _getChildren:function(node_hash,pi_paths) {
        var deferred = Ext.create('Deft.Deferred');
        var me = this;
        Ext.create('Rally.data.wsapi.Store',{
            model: this._getChildModelForItem(node_hash,pi_paths),
            filters: [
                this._getChildFilterForItem(node_hash,pi_paths)
            ],
            fetch: ['FormattedID','Name','DirectChildrenCount','Children','AcceptedDate','ScheduleState', me.rollup_field],
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
                            record_data.expanded = true;
                            promises.push( me._getChildren(record_data,pi_paths) );
                        } else if ( record.get('DirectChildrenCount') && record.get('DirectChildrenCount') > 0)  {
                            record_data.leaf = false;
                            record_data.expanded = true;
                            promises.push( me._getChildren(record_data,pi_paths) );
                        }
                        
                        // set value for calculating field
                        record_data.__rollup = record.get(me.rollup_field);
                        if ( me._isAccepted(record_data) ) {
                            record_data.__accepted_rollup = record.get(me.rollup_field);
                        }
                        child_hashes.push(record_data);
                    });
                    node_hash.children = child_hashes;
                    if ( promises.length > 0 ) {
                        Deft.Promise.all(promises).then({
                            scope: this,
                            success: function(records){
                                node_hash.__rollup = this._calculateRollup(node_hash,child_hashes,'__rollup');
                                node_hash.__accepted_rollup = this._calculateRollup(node_hash,child_hashes,'__accepted_rollup');
                                deferred.resolve(node_hash);
                            },
                            failure: function(error) {
                                deferred.reject(error);
                            }
                        });
                    } else {
                        node_hash.__rollup = this._calculateRollup(node_hash,child_hashes,'__rollup');
                        node_hash.__accepted_rollup = this._calculateRollup(node_hash,child_hashes,'__accepted_rollup');
                        deferred.resolve();
                    }
                }
            }
        });
        return deferred.promise;
    },
    _isAccepted: function(record_data) {
        this.logger.log("_isAccepted",record_data.FormattedID,record_data);
        var accepted = false; 
        if ( record_data.AcceptedDate !== null ) {
            accepted = true;
        }
        return accepted;
    },
    _calculateRollup: function(node_hash,child_hashes,field_name) {
        var me = this;
        // roll up the data
        var total_rollup = 0;
        
        //this.logger.log("calculating rollup for ", node_hash.FormattedID, node_hash);
        Ext.Array.each(child_hashes,function(child){
            var rollup_value = child[field_name] || 0;
            total_rollup += rollup_value;
        });
        return total_rollup;
    },
    _addTreeGrid: function(tree_store) {
        var me = this;
        var name_renderer = function(value,meta_data,record) {
            return me._nameRenderer(value,meta_data,record);
        }
        
        var pi_tree = this.down('#display_box').add({
            xtype:'treepanel',
            store: tree_store,
            rootVisible: false,
            columns: [{
                xtype: 'treecolumn',
                text: 'id',
                dataIndex: 'FormattedID',
                renderer: name_renderer,
                flex: 2
            },
            {
                dataIndex: '__rollup',
                text: 'PERT'
            },
            {
                dataIndex: '__accepted_rollup',
                text: 'PERT Completed'
            },
            {
                dataIndex: '__accepted_rollup',
                text: 'Pert Remaining',
                renderer: function(value,meta_data,record){
                    var total_rollup = record.get('__rollup') || 0;
                    var accepted_rollup = record.get('__accepted_rollup') || 0;
                    return total_rollup - accepted_rollup;
                }
            }]
        });
    },
    _nameRenderer: function(value,meta_data,record) {
        var me = this;
        //me.logger.log("Display ", value, record.get('FormattedID'),record);
        return value + ": " + record.get('Name');
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
    }
});
