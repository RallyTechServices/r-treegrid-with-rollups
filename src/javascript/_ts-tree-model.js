Ext.define('TSTreeModel',{
    extend: 'Ext.data.Model',
    fields: [
        { name: 'FormattedID', type: 'String' },
        { name: 'Name', type:'String' },
        { name: 'ScheduleState', type:'String' },
        { name: 'PlannedStartDate', type: 'Date' },
        { name: 'PlannedEndDate', type: 'Date' },
        { name: '_type', type:'String' },
        { name: '__original_value', type: 'auto' },
        { name: '__rollup', type:'Float' },
        { name: '__accepted_rollup', type: 'Float' },
        { name: '__pert_delta', type: 'Float' },
        { name: '__is_top_pi', type: 'Boolean', defaultValue: false }
    ]
});