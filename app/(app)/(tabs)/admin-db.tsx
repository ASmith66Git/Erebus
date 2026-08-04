import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, Pressable, TextInput,
  ActivityIndicator, Alert, ScrollView, Modal, Switch,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'expo-router';
import { authFetch } from '@/utils/authFetch';
import PageHeader from '@/components/PageHeader';
import ThemedBackground from '@/components/ThemedBackground';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────
interface TableInfo {
  table_name: string;
  row_count: number;
}

interface ColumnInfo {
  column_name: string;
  data_type: string;
  is_nullable: string;
}

interface TableData {
  columns: ColumnInfo[];
  rows: Record<string, any>[];
  total: number;
  page: number;
  pages: number;
  limit: number;
}

type View = 'tables' | 'rows' | 'row';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
function formatValue(v: any): string {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

function isBoolean(col: ColumnInfo) {
  return col.data_type === 'boolean';
}

function parseBoolean(v: any): boolean {
  if (typeof v === 'boolean') return v;
  if (v === 'true' || v === 't') return true;
  return false;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main screen
// ─────────────────────────────────────────────────────────────────────────────
export default function AdminDbScreen() {
  const { colors } = useTheme();
  const { token, isAdmin } = useAuth();
  const router = useRouter();

  // View state
  const [view, setView]             = useState<View>('tables');
  const [selectedTable, setSelectedTable] = useState<string>('');
  const [selectedRow, setSelectedRow]     = useState<Record<string, any> | null>(null);

  // Tables list
  const [tables, setTables]         = useState<TableInfo[]>([]);
  const [tableSearch, setTableSearch] = useState('');
  const [tablesLoading, setTablesLoading] = useState(false);

  // Rows view
  const [tableData, setTableData]   = useState<TableData | null>(null);
  const [rowsPage, setRowsPage]     = useState(1);
  const [rowsLoading, setRowsLoading] = useState(false);

  // Row edit
  const [editing, setEditing]       = useState(false);
  const [editValues, setEditValues] = useState<Record<string, string>>({});
  const [saving, setSaving]         = useState(false);
  const [addModal, setAddModal]     = useState(false);
  const [addValues, setAddValues]   = useState<Record<string, string>>({});
  const [adding, setAdding]         = useState(false);

  // ── Guards ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isAdmin) router.replace('/' as any);
    else fetchTables();
  }, [isAdmin]);

  // ── Table list ────────────────────────────────────────────────────────────
  const fetchTables = useCallback(async () => {
    setTablesLoading(true);
    try {
      const r = await authFetch('/api/admin/db/tables', token);
      if (r.ok) setTables(await r.json());
    } finally {
      setTablesLoading(false);
    }
  }, [token]);

  const filteredTables = tables.filter(t =>
    t.table_name.toLowerCase().includes(tableSearch.toLowerCase())
  );

  // ── Rows ──────────────────────────────────────────────────────────────────
  const fetchRows = useCallback(async (table: string, page = 1) => {
    setRowsLoading(true);
    try {
      const r = await authFetch(`/api/admin/db/tables/${encodeURIComponent(table)}/rows?page=${page}&limit=50`, token);
      if (r.ok) {
        setTableData(await r.json());
        setRowsPage(page);
      } else {
        Alert.alert('Error', 'Failed to load rows');
      }
    } finally {
      setRowsLoading(false);
    }
  }, [token]);

  const openTable = (table: string) => {
    setSelectedTable(table);
    setView('rows');
    fetchRows(table, 1);
  };

  // ── Row detail ────────────────────────────────────────────────────────────
  const openRow = (row: Record<string, any>) => {
    setSelectedRow(row);
    const vals: Record<string, string> = {};
    for (const k of Object.keys(row)) {
      vals[k] = row[k] === null || row[k] === undefined ? '' : String(row[k]);
    }
    setEditValues(vals);
    setEditing(false);
    setView('row');
  };

  const saveRow = async () => {
    if (!selectedRow || !tableData) return;
    const id = selectedRow.id;
    if (!id) return Alert.alert('Error', 'Row has no id column — cannot update');
    setSaving(true);
    try {
      const payload: Record<string, any> = {};
      for (const [k, v] of Object.entries(editValues)) {
        if (k === 'id') continue;
        payload[k] = v === '' ? null : v;
      }
      const r = await authFetch(`/api/admin/db/tables/${encodeURIComponent(selectedTable)}/rows/${id}`, token, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (r.ok) {
        const updated = await r.json();
        setSelectedRow(updated);
        setEditing(false);
        fetchRows(selectedTable, rowsPage);
      } else {
        const err = await r.json();
        Alert.alert('Error', err.error || 'Failed to save');
      }
    } finally {
      setSaving(false);
    }
  };

  const deleteRow = () => {
    if (!selectedRow) return;
    const id = selectedRow.id;
    if (!id) return Alert.alert('Error', 'Row has no id column — cannot delete');
    Alert.alert(
      'Delete Row',
      `Delete row id=${id} from ${selectedTable}? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete', style: 'destructive', onPress: async () => {
            setSaving(true);
            try {
              const r = await authFetch(`/api/admin/db/tables/${encodeURIComponent(selectedTable)}/rows/${id}`, token, { method: 'DELETE' });
              if (r.ok) {
                setView('rows');
                fetchRows(selectedTable, rowsPage);
              } else {
                const err = await r.json();
                Alert.alert('Error', err.error || 'Failed to delete');
              }
            } finally {
              setSaving(false);
            }
          }
        }
      ]
    );
  };

  // ── Add row ───────────────────────────────────────────────────────────────
  const openAddModal = () => {
    const init: Record<string, string> = {};
    for (const c of tableData?.columns || []) {
      if (c.column_name !== 'id') init[c.column_name] = '';
    }
    setAddValues(init);
    setAddModal(true);
  };

  const submitAdd = async () => {
    setAdding(true);
    try {
      const payload: Record<string, any> = {};
      for (const [k, v] of Object.entries(addValues)) {
        payload[k] = v === '' ? null : v;
      }
      const r = await authFetch(`/api/admin/db/tables/${encodeURIComponent(selectedTable)}/rows`, token, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (r.ok) {
        setAddModal(false);
        fetchRows(selectedTable, 1);
      } else {
        const err = await r.json();
        Alert.alert('Error', err.error || 'Failed to insert');
      }
    } finally {
      setAdding(false);
    }
  };

  // ── Back nav ──────────────────────────────────────────────────────────────
  const goBack = () => {
    if (view === 'row') {
      setView('rows');
      setEditing(false);
    } else if (view === 'rows') {
      setView('tables');
      setTableData(null);
    }
  };

  if (!isAdmin) return null;

  // ══════════════════════════════════════════════════════════════════════════
  // Render: Table List
  // ══════════════════════════════════════════════════════════════════════════
  if (view === 'tables') {
    return (
      <ThemedBackground>
        <PageHeader title="Database" />
        <View style={styles.container}>
          <View style={[styles.searchBar, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
            <Ionicons name="search-outline" size={16} color={colors.textSecondary} />
            <TextInput
              style={[styles.searchInput, { color: colors.text }]}
              placeholder="Filter tables…"
              placeholderTextColor={colors.textSecondary}
              value={tableSearch}
              onChangeText={setTableSearch}
              autoCapitalize="none"
            />
            {tableSearch !== '' && (
              <Pressable onPress={() => setTableSearch('')}>
                <Ionicons name="close-circle" size={16} color={colors.textSecondary} />
              </Pressable>
            )}
          </View>

          {tablesLoading ? (
            <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />
          ) : (
            <FlatList
              data={filteredTables}
              keyExtractor={t => t.table_name}
              contentContainerStyle={{ paddingBottom: 40 }}
              ListHeaderComponent={
                <Text style={[styles.metaText, { color: colors.textSecondary }]}>
                  {filteredTables.length} tables
                </Text>
              }
              renderItem={({ item }) => (
                <Pressable
                  style={[styles.tableRow, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}
                  onPress={() => openTable(item.table_name)}
                >
                  <Ionicons name="grid-outline" size={18} color={colors.primary} style={{ marginRight: 10 }} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.tableName, { color: colors.text }]}>{item.table_name}</Text>
                  </View>
                  <Text style={[styles.rowCount, { color: colors.textSecondary }]}>
                    {item.row_count.toLocaleString()}
                  </Text>
                  <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} style={{ marginLeft: 6 }} />
                </Pressable>
              )}
            />
          )}
        </View>
      </ThemedBackground>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Render: Row List
  // ══════════════════════════════════════════════════════════════════════════
  if (view === 'rows') {
    const previewCols = (tableData?.columns || []).slice(0, 4).map(c => c.column_name);

    return (
      <ThemedBackground>
        <PageHeader
          title={selectedTable}
          showBack
          onBack={goBack}
          rightAction={
            <Pressable onPress={openAddModal} style={[styles.addBtn, { backgroundColor: colors.primary }]}>
              <Ionicons name="add" size={18} color="#FFF" />
            </Pressable>
          }
        />
        <View style={styles.container}>
          {rowsLoading && !tableData ? (
            <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />
          ) : (
            <>
              <Text style={[styles.metaText, { color: colors.textSecondary }]}>
                {tableData?.total.toLocaleString() ?? 0} rows · page {rowsPage}/{tableData?.pages ?? 1}
              </Text>

              {/* Column headers preview */}
              {tableData && (
                <View style={[styles.colHeaderRow, { borderColor: colors.border }]}>
                  {previewCols.map(col => (
                    <Text key={col} style={[styles.colHeader, { color: colors.primary }]} numberOfLines={1}>
                      {col}
                    </Text>
                  ))}
                </View>
              )}

              <FlatList
                data={tableData?.rows || []}
                keyExtractor={(_, i) => String(i)}
                contentContainerStyle={{ paddingBottom: 80 }}
                renderItem={({ item }) => (
                  <Pressable
                    style={[styles.dataRow, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}
                    onPress={() => openRow(item)}
                  >
                    {previewCols.map(col => (
                      <Text key={col} style={[styles.dataCell, { color: colors.text }]} numberOfLines={1}>
                        {formatValue(item[col])}
                      </Text>
                    ))}
                    <Ionicons name="chevron-forward" size={14} color={colors.textSecondary} />
                  </Pressable>
                )}
              />

              {/* Pagination */}
              {tableData && tableData.pages > 1 && (
                <View style={styles.pagination}>
                  <Pressable
                    disabled={rowsPage <= 1 || rowsLoading}
                    onPress={() => fetchRows(selectedTable, rowsPage - 1)}
                    style={[styles.pageBtn, { backgroundColor: colors.cardBackground, borderColor: colors.border, opacity: rowsPage <= 1 ? 0.4 : 1 }]}
                  >
                    <Ionicons name="chevron-back" size={16} color={colors.primary} />
                    <Text style={[styles.pageBtnText, { color: colors.primary }]}>Prev</Text>
                  </Pressable>
                  <Text style={[styles.pageNum, { color: colors.textSecondary }]}>
                    {rowsPage} / {tableData.pages}
                  </Text>
                  <Pressable
                    disabled={rowsPage >= tableData.pages || rowsLoading}
                    onPress={() => fetchRows(selectedTable, rowsPage + 1)}
                    style={[styles.pageBtn, { backgroundColor: colors.cardBackground, borderColor: colors.border, opacity: rowsPage >= tableData.pages ? 0.4 : 1 }]}
                  >
                    <Text style={[styles.pageBtnText, { color: colors.primary }]}>Next</Text>
                    <Ionicons name="chevron-forward" size={16} color={colors.primary} />
                  </Pressable>
                </View>
              )}
            </>
          )}
        </View>

        {/* Add Row Modal */}
        <Modal visible={addModal} animationType="slide" onRequestClose={() => setAddModal(false)}>
          <ThemedBackground>
            <PageHeader title={`Add Row — ${selectedTable}`} showBack onBack={() => setAddModal(false)} />
            <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 60 }}>
              {(tableData?.columns || []).filter(c => c.column_name !== 'id').map(col => (
                <View key={col.column_name} style={styles.fieldRow}>
                  <Text style={[styles.fieldKey, { color: colors.textSecondary }]}>
                    {col.column_name}
                    <Text style={{ color: colors.textSecondary, fontSize: 11 }}>  {col.data_type}</Text>
                  </Text>
                  {isBoolean(col) ? (
                    <Switch
                      value={addValues[col.column_name] === 'true'}
                      onValueChange={v => setAddValues(p => ({ ...p, [col.column_name]: v ? 'true' : 'false' }))}
                      trackColor={{ true: colors.primary }}
                    />
                  ) : (
                    <TextInput
                      style={[styles.fieldInput, { backgroundColor: colors.cardBackground, borderColor: colors.border, color: colors.text }]}
                      value={addValues[col.column_name] ?? ''}
                      onChangeText={v => setAddValues(p => ({ ...p, [col.column_name]: v }))}
                      placeholder={col.is_nullable === 'YES' ? 'null' : 'required'}
                      placeholderTextColor={colors.textSecondary}
                      multiline={false}
                      autoCapitalize="none"
                    />
                  )}
                </View>
              ))}
              <Pressable
                style={[styles.saveBtn, { backgroundColor: colors.primary, opacity: adding ? 0.6 : 1 }]}
                onPress={submitAdd}
                disabled={adding}
              >
                {adding ? <ActivityIndicator color="#FFF" size="small" /> : <Text style={styles.saveBtnText}>Insert Row</Text>}
              </Pressable>
            </ScrollView>
          </ThemedBackground>
        </Modal>
      </ThemedBackground>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Render: Row Detail / Edit
  // ══════════════════════════════════════════════════════════════════════════
  const columns = tableData?.columns || [];

  return (
    <ThemedBackground>
      <PageHeader
        title={`id = ${selectedRow?.id ?? '—'}`}
        showBack
        onBack={goBack}
        rightAction={
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {!editing && (
              <Pressable onPress={() => setEditing(true)} style={[styles.iconBtn, { borderColor: colors.border }]}>
                <Ionicons name="pencil-outline" size={18} color={colors.primary} />
              </Pressable>
            )}
            {editing && (
              <>
                <Pressable onPress={() => { setEditing(false); }} style={[styles.iconBtn, { borderColor: colors.border }]}>
                  <Ionicons name="close-outline" size={18} color={colors.textSecondary} />
                </Pressable>
                <Pressable
                  onPress={saveRow}
                  disabled={saving}
                  style={[styles.saveBtn, { backgroundColor: colors.primary, paddingVertical: 6, paddingHorizontal: 14, opacity: saving ? 0.6 : 1 }]}
                >
                  {saving ? <ActivityIndicator color="#FFF" size="small" /> : <Text style={styles.saveBtnText}>Save</Text>}
                </Pressable>
              </>
            )}
          </View>
        }
      />
      <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 80 }}>
        <Text style={[styles.metaText, { color: colors.textSecondary, marginBottom: 12 }]}>{selectedTable}</Text>

        {columns.map(col => {
          const rawVal = selectedRow?.[col.column_name];
          const editVal = editValues[col.column_name] ?? '';

          return (
            <View key={col.column_name} style={[styles.fieldRow, { borderBottomColor: colors.border }]}>
              <Text style={[styles.fieldKey, { color: colors.textSecondary }]}>
                {col.column_name}
              </Text>
              {editing ? (
                isBoolean(col) ? (
                  <Switch
                    value={editVal === 'true' || editVal === 't'}
                    onValueChange={v => setEditValues(p => ({ ...p, [col.column_name]: v ? 'true' : 'false' }))}
                    trackColor={{ true: colors.primary }}
                  />
                ) : (
                  <TextInput
                    style={[styles.fieldInput, { backgroundColor: colors.cardBackground, borderColor: colors.border, color: colors.text }]}
                    value={editVal}
                    onChangeText={v => setEditValues(p => ({ ...p, [col.column_name]: v }))}
                    placeholder="null"
                    placeholderTextColor={colors.textSecondary}
                    multiline={col.data_type === 'text' || col.data_type === 'jsonb'}
                    numberOfLines={col.data_type === 'text' ? 3 : 1}
                    autoCapitalize="none"
                    editable={col.column_name !== 'id'}
                  />
                )
              ) : (
                <Text
                  style={[
                    styles.fieldValue,
                    { color: rawVal === null || rawVal === undefined ? colors.textSecondary : colors.text },
                  ]}
                  selectable
                >
                  {formatValue(rawVal)}
                </Text>
              )}
            </View>
          );
        })}

        {/* Delete button */}
        {selectedRow?.id && (
          <Pressable
            onPress={deleteRow}
            style={[styles.deleteBtn, { borderColor: colors.error }]}
          >
            <Ionicons name="trash-outline" size={16} color={colors.error} />
            <Text style={[styles.deleteBtnText, { color: colors.error }]}>Delete Row</Text>
          </Pressable>
        )}
      </ScrollView>
    </ThemedBackground>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 16 },
  metaText: { fontSize: 12, marginBottom: 8, marginTop: 4 },

  // Search
  searchBar: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 10, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 12, marginTop: 8 },
  searchInput: { flex: 1, fontSize: 14, padding: 0 },

  // Table list
  tableRow: { flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: 10, borderWidth: 1, marginBottom: 8 },
  tableName: { fontSize: 14, fontWeight: '500' },
  rowCount: { fontSize: 13, fontFamily: 'monospace' },

  // Row list
  colHeaderRow: { flexDirection: 'row', paddingHorizontal: 12, paddingVertical: 6, borderBottomWidth: 1, marginBottom: 4 },
  colHeader: { flex: 1, fontSize: 11, fontWeight: '600', textTransform: 'uppercase' },
  dataRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10, borderRadius: 8, borderWidth: 1, marginBottom: 6 },
  dataCell: { flex: 1, fontSize: 12, fontFamily: 'monospace' },

  // Pagination
  pagination: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12 },
  pageBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, borderWidth: 1 },
  pageBtnText: { fontSize: 14, fontWeight: '500' },
  pageNum: { fontSize: 13 },

  // Add button
  addBtn: { width: 32, height: 32, borderRadius: 16, justifyContent: 'center', alignItems: 'center' },

  // Row detail / edit
  fieldRow: { paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  fieldKey: { fontSize: 11, fontWeight: '600', textTransform: 'uppercase', marginBottom: 4, letterSpacing: 0.5 },
  fieldValue: { fontSize: 13, fontFamily: 'monospace', flexShrink: 1 },
  fieldInput: { fontSize: 13, fontFamily: 'monospace', borderWidth: 1, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 6 },

  // Buttons
  iconBtn: { width: 34, height: 34, borderRadius: 8, borderWidth: 1, justifyContent: 'center', alignItems: 'center' },
  saveBtn: { borderRadius: 8, paddingVertical: 10, paddingHorizontal: 20, alignItems: 'center', justifyContent: 'center', flexDirection: 'row' },
  saveBtnText: { color: '#FFF', fontWeight: '600', fontSize: 14 },
  deleteBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 32, borderWidth: 1, borderRadius: 10, paddingVertical: 12 },
  deleteBtnText: { fontSize: 15, fontWeight: '500' },
});
