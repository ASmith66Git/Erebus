import React, { useState } from 'react';
import {
  View,
  Text,
  Pressable,
  Modal,
  StyleSheet,
} from 'react-native';
import DateTimePicker from 'react-native-ui-datepicker';
import dayjs from 'dayjs';
import { Feather } from '@expo/vector-icons';
import { useTheme } from '@/contexts/ThemeContext';

interface DatePickerFieldProps {
  label: string;
  value: string;
  onChange: (date: string) => void;
  placeholder?: string;
  minDate?: Date;
  maxDate?: Date;
}

export default function DatePickerField({
  label,
  value,
  onChange,
  placeholder = 'Select date',
  minDate,
  maxDate,
}: DatePickerFieldProps) {
  const { colors, isDark } = useTheme();
  const [showPicker, setShowPicker] = useState(false);
  
  const selectedDate = value ? dayjs(value) : dayjs();
  
  const formatDisplayDate = (dateStr: string) => {
    if (!dateStr) return '';
    const d = dayjs(dateStr);
    return d.format('D MMM YYYY');
  };

  const handleDateChange = (params: any) => {
    if (params.date) {
      onChange(dayjs(params.date).format('YYYY-MM-DD'));
      setShowPicker(false);
    }
  };

  const handleClear = () => {
    onChange('');
  };

  return (
    <View style={styles.container}>
      <Text style={[styles.label, { color: colors.text }]}>{label}</Text>
      <Pressable
        style={[
          styles.inputButton,
          { backgroundColor: colors.background, borderColor: colors.border },
        ]}
        onPress={() => setShowPicker(true)}
      >
        <Feather name="calendar" size={18} color={colors.textSecondary} style={styles.icon} />
        <Text
          style={[
            styles.inputText,
            { color: value ? colors.text : colors.textSecondary },
          ]}
        >
          {value ? formatDisplayDate(value) : placeholder}
        </Text>
        {value ? (
          <Pressable onPress={handleClear} hitSlop={8}>
            <Feather name="x-circle" size={18} color={colors.textSecondary} />
          </Pressable>
        ) : (
          <Feather name="chevron-down" size={18} color={colors.textSecondary} />
        )}
      </Pressable>

      <Modal
        visible={showPicker}
        animationType="fade"
        transparent
        onRequestClose={() => setShowPicker(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setShowPicker(false)}
        >
          <Pressable
            style={[styles.modalContent, { backgroundColor: colors.surface }]}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>Select Date</Text>
              <Pressable onPress={() => setShowPicker(false)}>
                <Feather name="x" size={24} color={colors.text} />
              </Pressable>
            </View>

            <View style={styles.pickerContainer}>
              <DateTimePicker
                mode="single"
                date={selectedDate}
                onChange={handleDateChange}
                minDate={minDate}
                maxDate={maxDate}
                styles={{
                  day_label: { color: colors.text },
                  button_prev_image: { tintColor: colors.primary },
                  button_next_image: { tintColor: colors.primary },
                  selected: { backgroundColor: colors.primary, borderRadius: 8 },
                  selected_label: { color: '#FFFFFF', fontWeight: '600' },
                  today: { borderColor: colors.primary, borderWidth: 1, borderRadius: 8 },
                  today_label: { color: colors.primary },
                  weekday_label: { color: colors.textSecondary },
                } as any}
              />
            </View>

            <View style={[styles.modalFooter, { borderTopColor: colors.border }]}>
              <Pressable
                style={[styles.footerButton, { backgroundColor: colors.background }]}
                onPress={() => {
                  onChange('');
                  setShowPicker(false);
                }}
              >
                <Text style={[styles.footerButtonText, { color: colors.textSecondary }]}>Clear</Text>
              </Pressable>
              <Pressable
                style={[styles.footerButton, { backgroundColor: colors.primary }]}
                onPress={() => {
                  onChange(dayjs().format('YYYY-MM-DD'));
                  setShowPicker(false);
                }}
              >
                <Text style={[styles.footerButtonText, { color: '#FFFFFF' }]}>Today</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 6,
  },
  inputButton: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    minHeight: 48,
  },
  icon: {
    marginRight: 8,
  },
  inputText: {
    flex: 1,
    fontSize: 16,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    width: '100%',
    maxWidth: 380,
    borderRadius: 16,
    overflow: 'hidden',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  pickerContainer: {
    padding: 16,
  },
  modalFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
  },
  footerButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  footerButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
});
