Ext.define('TSTreeModel',{
    extend: 'Ext.data.Model',
    fields: [
        { name: 'FormattedID', type: 'String' },
        { name: 'Name', type:'String' },
        { name: 'ScheduleState', type:'String' },
        { name: '_type', type:'String' },
        { name: '__rollup', type:'Float' },
        { name: '__accepted_rollup', type: 'Float' }
    ]
});