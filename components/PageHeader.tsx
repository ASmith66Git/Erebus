import React from 'react';
import { View, Text, StyleSheet, SafeAreaView, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { DrawerActions, useNavigation } from '@react-navigation/native';
import { useTheme } from '@/contexts/ThemeContext';
import Logo from './Logo';

interface PageHeaderProps {
  title: string;
  rightAction?: React.ReactNode;
}

export default function PageHeader({ title, rightAction }: PageHeaderProps) {
  const { colors, isDark, toggleTheme } = useTheme();
  const navigation = useNavigation();

  const openDrawer = () => {
    navigation.dispatch(DrawerActions.openDrawer());
  };

  return (
    <SafeAreaView style={[styles.header, { backgroundColor: colors.headerBackground, borderBottomColor: colors.border }]}>
      <Pressable onPress={openDrawer} style={styles.menuButton}>
        <Ionicons name="menu-outline" size={24} color={colors.text} />
      </Pressable>
      <View style={styles.headerCenter}>
        <View style={styles.logoWrapper}>
          <Logo size={28} primaryColor={colors.primary} />
        </View>
        <Text style={[styles.headerTitle, { color: colors.text }]}>{title}</Text>
      </View>
      <View style={styles.rightActions}>
        {rightAction}
        <Pressable onPress={toggleTheme} style={styles.themeButton}>
          <Ionicons name={isDark ? 'sunny-outline' : 'moon-outline'} size={22} color={colors.text} />
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 6,
    borderBottomWidth: 1,
  },
  menuButton: {
    padding: 8,
  },
  headerCenter: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
    gap: 8,
  },
  logoWrapper: {
    marginBottom: 2,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  rightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  themeButton: {
    padding: 8,
  },
});
