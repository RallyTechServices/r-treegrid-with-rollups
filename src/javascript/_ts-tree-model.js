Ext.define('TSTreeModel',{
    extend: 'Ext.data.Model',
    fields: [
        { name: 'FormattedID', type: 'String' },
        { name: 'Name', type:'Name' },
        { name: '_type', type:'String' },
        { name: '__rollup', type:'Float' }
    ]
});