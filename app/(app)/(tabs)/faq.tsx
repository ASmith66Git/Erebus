import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Platform,
} from 'react-native';
import { Ionicons, Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '@/contexts/ThemeContext';
import PageHeader from '@/components/PageHeader';
import ThemedBackground from '@/components/ThemedBackground';
import { useTranslation } from 'react-i18next';

interface FAQItem {
  id: string;
  question: string;
  answer: string;
  category: string;
}

const FAQ_DATA_KEYS = [
  { id: '1', category: 'gettingStarted', questionKey: 'q1', answerKey: 'a1' },
  { id: '2', category: 'gettingStarted', questionKey: 'q2', answerKey: 'a2' },
  { id: '3', category: 'gettingStarted', questionKey: 'q3', answerKey: 'a3' },
  { id: '4', category: 'diveComputerSync', questionKey: 'q4', answerKey: 'a4' },
  { id: '5', category: 'diveComputerSync', questionKey: 'q5', answerKey: 'a5' },
  { id: '6', category: 'diveComputerSync', questionKey: 'q6', answerKey: 'a6' },
  { id: '7', category: 'divePlanning', questionKey: 'q7', answerKey: 'a7' },
  { id: '8', category: 'divePlanning', questionKey: 'q8', answerKey: 'a8' },
  { id: '9', category: 'divePlanning', questionKey: 'q9', answerKey: 'a9' },
  { id: '10', category: 'gasCalculator', questionKey: 'q10', answerKey: 'a10' },
  { id: '11', category: 'gasCalculator', questionKey: 'q11', answerKey: 'a11' },
  { id: '12', category: 'gearCertifications', questionKey: 'q12', answerKey: 'a12' },
  { id: '13', category: 'gearCertifications', questionKey: 'q13', answerKey: 'a13' },
  { id: '14', category: 'photosMedia', questionKey: 'q14', answerKey: 'a14' },
  { id: '15', category: 'photosMedia', questionKey: 'q15', answerKey: 'a15' },
  { id: '16', category: 'diveSitesCategory', questionKey: 'q16', answerKey: 'a16' },
];

const CATEGORY_KEYS = [...new Set(FAQ_DATA_KEYS.map(item => item.category))];

export default function FAQScreen() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  const toggleItem = (id: string) => {
    setExpandedItems(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const faqData: FAQItem[] = FAQ_DATA_KEYS.map(item => ({
    id: item.id,
    category: item.category,
    question: t(`faq.${item.questionKey}`),
    answer: t(`faq.${item.answerKey}`),
  }));

  const filteredFAQ = selectedCategory
    ? faqData.filter(item => item.category === selectedCategory)
    : faqData;

  const groupedFAQ = filteredFAQ.reduce((acc, item) => {
    if (!acc[item.category]) {
      acc[item.category] = [];
    }
    acc[item.category].push(item);
    return acc;
  }, {} as Record<string, FAQItem[]>);

  return (
    <ThemedBackground style={styles.container}>
      <PageHeader title={t('faq.title')} showBack />
      
      <View style={styles.categoryScrollWrapper}>
        <ScrollView 
          horizontal 
          showsHorizontalScrollIndicator={false}
          style={styles.categoryScroll}
          contentContainerStyle={styles.categoryContainer}
        >
          <Pressable
            onPress={() => setSelectedCategory(null)}
            style={[
              styles.categoryChip,
              { 
                backgroundColor: selectedCategory === null ? colors.primary : colors.surface,
                borderColor: colors.border,
              }
            ]}
          >
            <Text style={[
              styles.categoryText,
              { color: selectedCategory === null ? '#FFF' : colors.text }
            ]}>
              {t('faq.all')}
            </Text>
          </Pressable>
          {CATEGORY_KEYS.map(category => (
            <Pressable
              key={category}
              onPress={() => setSelectedCategory(category)}
              style={[
                styles.categoryChip,
                { 
                  backgroundColor: selectedCategory === category ? colors.primary : colors.surface,
                  borderColor: colors.border,
                }
              ]}
            >
              <Text style={[
                styles.categoryText,
                { color: selectedCategory === category ? '#FFF' : colors.text }
              ]}>
                {t(`faq.${category}`)}
              </Text>
            </Pressable>
          ))}
          <View style={styles.scrollEndPadding} />
        </ScrollView>
        <LinearGradient
          colors={[colors.background, 'transparent']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.scrollFadeLeft}
          pointerEvents="none"
        />
        <LinearGradient
          colors={['transparent', colors.background]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.scrollFadeRight}
          pointerEvents="none"
        />
        <View style={styles.scrollIndicator} pointerEvents="none">
          <Feather name="chevrons-right" size={16} color={colors.textSecondary} />
        </View>
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
        {Object.entries(groupedFAQ).map(([category, items]) => (
          <View key={category} style={styles.categorySection}>
            <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>
              {t(`faq.${category}`)}
            </Text>
            {items.map(item => (
              <Pressable
                key={item.id}
                onPress={() => toggleItem(item.id)}
                style={[styles.faqItem, { backgroundColor: colors.surface, borderColor: colors.border }]}
              >
                <View style={styles.questionRow}>
                  <Text style={[styles.question, { color: colors.text }]}>
                    {item.question}
                  </Text>
                  <Ionicons
                    name={expandedItems.has(item.id) ? 'chevron-up' : 'chevron-down'}
                    size={20}
                    color={colors.textSecondary}
                  />
                </View>
                {expandedItems.has(item.id) && (
                  <Text style={[styles.answer, { color: colors.textSecondary }]}>
                    {item.answer}
                  </Text>
                )}
              </Pressable>
            ))}
          </View>
        ))}
        
        <View style={styles.footer}>
          <Text style={[styles.footerText, { color: colors.textSecondary }]}>
            {t('faq.cantFindAnswer')}
          </Text>
          <Text style={[styles.footerSubtext, { color: colors.textSecondary }]}>
            {t('faq.contactViaSupport')}
          </Text>
        </View>
      </ScrollView>
    </ThemedBackground>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  categoryScrollWrapper: {
    position: 'relative',
  },
  categoryScroll: {
    maxHeight: 50,
    flexGrow: 0,
  },
  categoryContainer: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 8,
  },
  scrollEndPadding: {
    width: 32,
  },
  scrollFadeLeft: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 16,
  },
  scrollFadeRight: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: 40,
  },
  scrollIndicator: {
    position: 'absolute',
    right: 8,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  categoryChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    marginRight: 8,
  },
  categoryText: {
    fontSize: 14,
    fontWeight: '500',
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
    paddingBottom: 40,
  },
  categorySection: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  faqItem: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
    marginBottom: 8,
  },
  questionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
  },
  question: {
    fontSize: 15,
    fontWeight: '600',
    flex: 1,
    lineHeight: 22,
  },
  answer: {
    fontSize: 14,
    lineHeight: 22,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(128,128,128,0.3)',
  },
  footer: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  footerText: {
    fontSize: 15,
    fontWeight: '500',
    marginBottom: 4,
  },
  footerSubtext: {
    fontSize: 13,
  },
});
