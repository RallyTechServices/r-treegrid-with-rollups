
var convertDelta = function(value,record) {
    var done = record.get('__accepted_rollup') || 0;
    var original = record.get('__original_value');
    if ( original || original === 0 ) {
        return done - original;
    }
    return "";
};
var convertRemaining = function(value,record) {
    var done = record.get('__accepted_rollup') || 0;
    var total = record.get('__rollup') || 0;
    var delta = total-done;
    return delta;
};

var convertProgressByOriginal = function(value,record) {
    var numerator = record.get('__accepted_rollup') || 0;
    var denominator = record.get('__original_value') || 0;
    var percentDone = 0;
    if ( denominator > 0 ) {
        percentDone = numerator / denominator;
    }
    return percentDone;
};

var convertProgressByRollup = function(value,record) {
    var numerator = record.get('__accepted_rollup') || 0;
    var denominator = record.get('__rollup') || 0;
    var percentDone = 0;
    if ( denominator > 0 ) {
        percentDone = numerator / denominator;
    }
    return percentDone;
};

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
        { name: '__calculated_delta', type: 'Float', convert: convertDelta },
        { name: '__calculated_remaining', type:'Float', convert: convertRemaining },
        { name: '__progress_by_original', type: 'Float', convert: convertProgressByOriginal },
        { name: '__progress_by_rollup', type: 'Float', convert: convertProgressByRollup },
        { name: '__is_top_pi', type: 'Boolean', defaultValue: false }
    ],
    set: function (fieldName, newValue) {
        var me = this,
            data = me[me.persistenceProperty],
            fields = me.fields,
            modified = me.modified,
            single = (typeof fieldName == 'string'),
            currentValue, field, idChanged, key, modifiedFieldNames, name, oldId,
            newId, value, values;

        if (single) {
            values = me._singleProp;
            values[fieldName] = newValue;
        } else {
            values = fieldName;
        }

        for (name in values) {
            if (values.hasOwnProperty(name)) {
                value = values[name];

                if (fields && (field = fields.get(name)) && field.convert) {
                    value = field.convert(value, me);
                }

                currentValue = data[name];
                if (me.isEqual(currentValue, value)) {
                    continue; // new value is the same, so no change...
                }

                data[name] = value;
                (modifiedFieldNames || (modifiedFieldNames = [])).push(name);

                if (field && field.persist) {
                    if (modified.hasOwnProperty(name)) {
                        if (me.isEqual(modified[name], value)) {
                            // The original value in me.modified equals the new value, so
                            // the field is no longer modified:
                            delete modified[name];

                            // We might have removed the last modified field, so check to
                            // see if there are any modified fields remaining and correct
                            // me.dirty:
                            me.dirty = false;
                            for (key in modified) {
                                if (modified.hasOwnProperty(key)){
                                    me.dirty = true;
                                    break;
                                }
                            }
                        }
                    } else {
                        me.dirty = true;
                        modified[name] = currentValue;
                        /* 
                         * Overridden here to recalculate the delta
                         */
                        if ( name == "__accepted_rollup" || name == "__original_value" ) {
                            var done = this.get('__accepted_rollup') || 0;
                            var original = this.get('__original_value') || 0;
                            var delta = done - original;
                            modifiedFieldNames.push( this.set("__calculated_delta", delta));
                        }
                        if ( name == "__accepted_rollup" || name == "__rollup" ) {
                            var done = this.get('__accepted_rollup') || 0;
                            var total = this.get('__rollup') || 0;
                            var delta = total-done;
                            modifiedFieldNames.push( this.set("__calculated_remaining", delta));
                        }
                    }
                }

                if (name == me.idProperty) {
                    idChanged = true;
                    oldId = currentValue;
                    newId = value;
                }
            }
        }

        if (single) {
            // cleanup our reused object for next time... important to do this before
            // we fire any events or call anyone else (like afterEdit)!
            delete values[fieldName];
        }

        if (idChanged) {
            me.fireEvent('idchanged', me, oldId, newId);
        }

        if (!me.editing && modifiedFieldNames) {
            me.afterEdit(modifiedFieldNames);
        }

        return modifiedFieldNames || null;
    }
});