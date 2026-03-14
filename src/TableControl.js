(function (root) {
    "use strict";
    const TableControl = {};
    const isNodeJS = typeof require === 'function';
    const Executor = isNodeJS ? require('./Executor.js') : root.Executor;
    const Utilities = isNodeJS ? require('./Utilities.js') : root.Utilities;
    const ObjectLifecycleManager = isNodeJS ? require('./ObjectLifecycleManager.js') : root.ObjectLifecycleManager;

    // This is the global sorting of data tables: DO NOT REMOVE !!!
    if ($.fn && $.fn.DataTable) {
        $.fn.DataTable.ext.oSort['texts-and-numbers-asc'] = Sorting.getTextsAndNumbersCompareFunction(true, false, true);
        $.fn.DataTable.ext.oSort['texts-and-numbers-desc'] = Sorting.getTextsAndNumbersCompareFunction(true, false, false);
        $.fn.DataTable.ext.oSort['texts-and-numbers-signed-asc'] = Sorting.getTextsAndNumbersCompareFunction(true, true, true);
        $.fn.DataTable.ext.oSort['texts-and-numbers-signed-desc'] = Sorting.getTextsAndNumbersCompareFunction(true, true, false);
        $.fn.DataTable.ext.oSort['timestamp-asc'] = Sorting.getTextsAndNumbersCompareFunction(true, false, false);
        $.fn.DataTable.ext.oSort['timestamp-desc'] = Sorting.getTextsAndNumbersCompareFunction(true, false, true);
    }

    function applyTable(that, onSuccess) {
        let _cont = that._hmi_context.container;
        _cont.addClass('overflow-hidden');
        let _tableId = Utilities.getUniqueId();
        // TODO???: let _scroller = new Utilities.ScrollHandler();
        let _columnCount = undefined;
        let _columns = [];
        if (typeof that.columns === 'number') {
            _columnCount = that.columns;
        } else if (Array.isArray(that.columns) && that.columns.length > 0) {
            _columnCount = that.columns.length;
            let widths = [];
            for (let i = 0; i < _columnCount; i++) {
                const column = that.columns[i];
                widths.push(typeof column.width === 'number' ? column.width : 1.0);
            }
            let parts = Utilities.createRelativeParts(widths);
            for (let i = 0; i < _columnCount; i++) {
                const column = that.columns[i];
                const cfg = {
                    width: (Math.floor(parts[i] * 10000) * 0.01).toString() + '%',
                    _id: Utilities.getUniqueId()
                };
                if (column.textsAndNumbers === true) {
                    cfg.type = 'texts-and-numbers';
                    cfg.orderable = true;
                } else if (column.timestamp === true) {
                    cfg.type = 'timestamp';
                    cfg.orderable = true;
                } else {
                    cfg.orderable = false;
                }
                _columns.push(cfg);
            }
        }
        function headerCallback(header, data, start, end, display) {
            for (let i = 0, l = _columns.length; i < l; i++) {
                const column = that.columns[i];
                const cell = $('#' + _columns[i]._id);
                if (typeof column.labelId === 'string' && column.labelId.length > 0) {
                    cell.text(that.hmi.access.Get(column.labelId)); // TODO: Get() not exists!
                } else if (typeof column.text === 'string' && column.text.length > 0) {
                    cell.text(column.text);
                }
            }
        };
        function rowCallback(row, data, displayIndex, displayIndexFull) {
            if (typeof that.prepareTableRow === 'function') {
                that.prepareTableRow(row, row._DT_RowIndex);
            }
        };
        let txt = `<table width="100%" id="${_tableId}"`;
        if (typeof that.tableStyle === 'string') {
            txt += ` style="${that.tableStyle}"`;
        }
        txt += '><thead><tr>';
        for (let i = 0, l = _columns.length; i < l; i++) {
            txt += '<th>';
            const column = that.columns[i];
            if (typeof column.labelId === 'string' && column.labelId.length > 0) {
                txt += `<b id="${_columns[i]._id}">${that.hmi.access.Get(column.labelId)}</b>`; // TODO: Get() not exists!
            } else if (typeof column.text === 'string' && column.text.length > 0) {
                txt += `<b id="${_columns[i]._id}">${column.text}</b>`;
            }
            txt += '</th>';
        }
        txt += '</tr></thead></table>';
        let _table = $(txt);
        _table.appendTo(_cont);
        let _dataTable = undefined;
        let _scrollBody = undefined;
        let _languageListener = undefined;
        that.hmi_dataTable = () => _dataTable;
        that.hmi_value = (row, column, value) => {
            const cell = _dataTable.cell(row, column);
            if (typeof value === 'string') {
                cell.data(value).draw(false);
            } else {
                return cell.data();
            }
        };
        that.hmi_isRowVisible = row => {
            const scrollBody = _scrollBody[0].getBoundingClientRect();
            const rowRect = _dataTable.row(row).node().getBoundingClientRect();
            return rowRect.bottom > scrollBody.top && rowRect.top < scrollBody.bottom;
        };
        that.hmi_isCellVisible = (row, column) => {
            const scrollBody = _scrollBody[0].getBoundingClientRect();
            const cellRect = _dataTable.cell(row, column).node().getBoundingClientRect();
            return cellRect.bottom > scrollBody.top && cellRect.top < scrollBody.bottom &&
                cellRect.right > scrollBody.left && cellRect.left < scrollBody.right;
        };
        that.hmi_reload = () => {
            if (_dataTable) {
                // we got to store some params to get adjust the scrolling after
                // reloading the table
                // TODO???: _scroller.prepare(_dataTable.parent(), _dataTable);
                // if we have a click handler for table rows
                if (typeof that.handleTableRowClicked === 'function') {
                    $('#' + _tableId + ' tbody tr').unbind('click');
                }
                // if we have a click handler for table row cells
                if (typeof that.handleTableCellClicked === 'function') {
                    $('#' + _tableId + ' tbody tr td').unbind('click');
                }
                _dataTable.clear();
                // check if data is available and load
                let rowCount = typeof that.getRowCount === 'function' ? that.getRowCount() : 0;
                if (rowCount > 0) {
                    const rows = [];
                    for (let r = 0; r < rowCount; r++) {
                        const cells = [];
                        for (let c = 0; c < _columns.length; c++) {
                            const cellHtml = typeof that.getCellHtml === 'function' ? that.getCellHtml(r, c) : undefined;
                            cells.push(cellHtml !== undefined && cellHtml !== null ? cellHtml : '');
                        }
                        rows.push(cells);
                    }
                    _dataTable.rows.add(rows, true);
                    // TODO???: _scroller.restore(_dataTable.parent(), _dataTable);
                    // if we have a click handler for table rows
                    if (typeof that.handleTableRowClicked === 'function') {
                        $(`#${_tableId} tbody`).on('click', 'tr', function (event) { // Note: Do not convert to lambda because 'this' must refer to the table row
                            if (that.highlightSelectedRow === true) {
                                _dataTable.$('tr.row_selected').removeClass('row_selected');
                                $(this).addClass('row_selected');
                            }
                            // const data = _dataTable.row( that ).data();
                            const rowIndex = event.currentTarget ? event.currentTarget._DT_RowIndex : undefined;
                            that.handleTableRowClicked(rowIndex);
                        });
                    }
                    // if we have a click handler for table row cells
                    if (typeof that.handleTableCellClicked === 'function') {
                        $(`#${_tableId} tbody`).on('click', 'td', event => {
                            const rowIndex = event.currentTarget && event.currentTarget.parentNode ? event.currentTarget.parentNode._DT_RowIndex : undefined;
                            const columnIndex = event.currentTarget ? event.currentTarget.cellIndex : undefined;
                            that.handleTableCellClicked(rowIndex, columnIndex);
                        });
                    }
                }
                _dataTable.draw();
            }
        };
        that._hmi_listenerAdds.push(() => that.hmi.lang.addLanguageObserver(_languageListener));
        that._hmi_listenerRemoves.push(() => that.hmi.lang.removeLanguageObserver(_languageListener));
        that._hmi_destroys.push(() => {
            if (_dataTable) {
                _dataTable.clear();
                _dataTable.destroy();
                _dataTable = undefined;
            }
            _table.remove();
            delete that.hmi_value;
            delete that.hmi_isRowVisible;
            delete that.hmi_isCellVisible;
            delete that.hmi_dataTable;
            delete that.hmi_reload;
            _tableId = undefined;
            _table = undefined;
            _scrollBody = undefined;
            // TODO???: _scroller = undefined;
            _columnCount = undefined;
            _columns = undefined;
            _cont = undefined;
            that = undefined;
        });
        try {
            let paging = that.paging === true;
            _dataTable = _table.DataTable({
                ordering: true,
                autoWidth: false,
                lengthChange: false,
                scrollY: !paging ? _cont.height().toString() + 'px' : undefined,
                scrollCollapse: true,
                scroller: !paging,
                scrollResize: !paging,
                paging: paging,
                pageResize: paging,
                columns: _columns,
                headerCallback: headerCallback,
                rowCallback: typeof that.prepareTableRow === 'function' ? rowCallback : undefined,
                searching: that.searching === true,
                deferRender: true,
            });
            _scrollBody = _cont.find('.dataTables_scrollBody');
            _languageListener = language => that.hmi_reload();
        }
        catch (exc) {
            console.error('EXCEPTION! Initializing data table: ' + exc);
        }
        onSuccess();
    }
    ObjectLifecycleManager.addApplyFunctionForType('table', applyTable);

    Object.freeze(TableControl);
    if (isNodeJS) {
        module.exports = TableControl;
    } else {
        root.TableControl = TableControl;
    }
}(globalThis));
