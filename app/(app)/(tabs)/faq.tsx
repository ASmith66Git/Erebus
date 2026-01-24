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

interface FAQItem {
  id: string;
  question: string;
  answer: string;
  category: string;
}

const FAQ_DATA: FAQItem[] = [
  {
    id: '1',
    category: 'Getting Started',
    question: 'How do I log my first dive?',
    answer: 'Go to the Dive Logs tab and tap the "+" button. You can manually enter dive details including depth, duration, water temperature, and conditions. If you have a Shearwater dive computer, you can also sync dives directly via Bluetooth.',
  },
  {
    id: '2',
    category: 'Getting Started',
    question: 'Can I import my existing dive logs?',
    answer: 'Yes! Erebus supports importing dive logs from UDDF files, Subsurface XML exports, and CSV files. Go to Dive Logs and look for the import option to upload your existing dive history.',
  },
  {
    id: '3',
    category: 'Getting Started',
    question: 'How do I delete the sample data?',
    answer: 'Sample dive logs and sites are added to help you explore the app. You can delete them individually by opening each item and using the delete option, or start fresh by going to your Profile and using the data management options.',
  },
  {
    id: '4',
    category: 'Dive Computer Sync',
    question: 'Which dive computers are supported?',
    answer: 'Currently, Erebus supports Shearwater dive computers with firmware v93 or later. We use the UDS protocol for reliable data transfer. More dive computer brands will be added in future updates.',
  },
  {
    id: '5',
    category: 'Dive Computer Sync',
    question: 'Why can\'t I connect to my dive computer?',
    answer: 'Make sure Bluetooth is enabled on your device and your dive computer is in transfer mode. For Shearwater computers, ensure you have firmware v93 or later. Try restarting both devices and attempting the connection again. The app works best when your dive computer is already paired/bonded with your phone.',
  },
  {
    id: '6',
    category: 'Dive Computer Sync',
    question: 'Do I need the native app for Bluetooth sync?',
    answer: 'Yes, Bluetooth dive computer sync only works on the native iOS and Android apps. The web version does not support Bluetooth connectivity. Download Erebus from the App Store or Google Play to use this feature.',
  },
  {
    id: '7',
    category: 'Dive Planning',
    question: 'What decompression algorithms does Erebus use?',
    answer: 'Erebus supports the full Bühlmann algorithm family: ZHL-16A, ZHL-16B, and ZHL-16C, all with configurable gradient factors (GF Low and GF High). We also support VPM-B (Variable Permeability Model) for bubble-based decompression planning. These are the same algorithms used by professional dive computers and are widely trusted in the technical diving community.',
  },
  {
    id: '8',
    category: 'Dive Planning',
    question: 'Can I plan CCR (rebreather) dives?',
    answer: 'Yes! The dive planner supports both Open Circuit (OC) and Closed Circuit Rebreather (CCR) configurations. For CCR, you can set your setpoint (PPO2) and diluent gas mix.',
  },
  {
    id: '9',
    category: 'Dive Planning',
    question: 'How do I export my dive plan?',
    answer: 'After creating a dive plan, you can export it as a PDF. This includes the dive profile chart, decompression schedule, gas requirements, and CNS/OTU tracking. Perfect for sharing with dive buddies or keeping as a record.',
  },
  {
    id: '10',
    category: 'Gas Calculator',
    question: 'What is Real Gas Mode in the gas calculator?',
    answer: 'Real Gas Mode uses NIST REFPROP v10 compressibility factors (Z-factors) for more accurate calculations at high pressures. This accounts for how real gases deviate from ideal gas behavior, especially important for high-pressure fills above 200 bar.',
  },
  {
    id: '11',
    category: 'Gas Calculator',
    question: 'How do I calculate a trimix blend?',
    answer: 'In the Gas Calculator, go to the Mix tab. Set your target mix (oxygen and helium percentages), your cylinder size, and target pressure. The calculator will show you the exact blending sequence - whether to add helium first, then oxygen, then air, or use other methods.',
  },
  {
    id: '12',
    category: 'Gear & Certifications',
    question: 'How do I add my certification cards?',
    answer: 'Go to the Certifications section and tap the "+" button. You can search for your certification agency and course, then take a photo of your card. The app will store your certification details and card image securely.',
  },
  {
    id: '13',
    category: 'Gear & Certifications',
    question: 'What are gear profiles?',
    answer: 'Gear profiles let you save complete equipment configurations for different types of diving. For example, you might have a "Tropical Travel" profile with a 3mm wetsuit and AL80 tank, and a "UK Wreck" profile with a drysuit and twinset. Switch between them easily when logging dives.',
  },
  {
    id: '14',
    category: 'Photos & Media',
    question: 'Are my photos compressed when uploaded?',
    answer: 'On the native Android/iOS app, videos are automatically compressed before upload to save storage and bandwidth. Photos are uploaded at their original quality. On the web version, media is uploaded without compression.',
  },
  {
    id: '15',
    category: 'Photos & Media',
    question: 'Can I link photos to specific dives?',
    answer: 'Yes! When viewing a photo, you can link it to a dive log or dive trip. This helps organize your underwater photography with your dive records. You can also see all photos associated with a dive from the dive log detail view.',
  },
  {
    id: '16',
    category: 'Dive Sites',
    question: 'How do I add a new dive site?',
    answer: 'Go to the Explore tab and tap the "+" button. You can enter the site details manually or use the map to drop a pin at the location. For wreck sites, the app includes links to Wrecksite database for detailed wreck information and history.',
  },
  {
    id: '17',
    category: 'Dive Sites',
    question: 'What does the weather forecast show?',
    answer: 'Each dive site includes a 7-day marine and atmospheric weather forecast based on its GPS coordinates. This includes wave height, water temperature, wind speed and direction, visibility conditions, and more. Perfect for planning your next dive trip.',
  },
  {
    id: '18',
    category: 'Units & Settings',
    question: 'Can I switch between metric and imperial units?',
    answer: 'Yes! Go to Settings to change between metric (meters, Celsius, bar) and imperial (feet, Fahrenheit, PSI) units. The app will convert and display all measurements in your preferred system.',
  },
  {
    id: '19',
    category: 'Units & Settings',
    question: 'How do I change the app theme?',
    answer: 'Erebus supports both dark and light themes. You can toggle between them in the Settings. The dark theme features a black background to save battery on OLED screens, while the light theme uses a clean white background.',
  },
  {
    id: '20',
    category: 'Data & Privacy',
    question: 'How do I export all my data?',
    answer: 'Go to your Profile and look for the export options. You can export just your data as an Excel spreadsheet, or do a full export that includes all your photos and videos in a ZIP archive.',
  },
  {
    id: '21',
    category: 'Data & Privacy',
    question: 'Is my dive data backed up?',
    answer: 'Yes, all your dive data is stored securely in the cloud and synced across your devices. The app also maintains a local database for offline access. Your data is automatically backed up whenever you have an internet connection.',
  },
  {
    id: '22',
    category: 'Data & Privacy',
    question: 'Can I use Erebus offline?',
    answer: 'Yes! Erebus works offline with a local database. You can log dives, view your existing logs, and access most features without internet. When you reconnect, your data will sync automatically with the cloud.',
  },
  {
    id: '23',
    category: 'Account & Support',
    question: 'How do I contact support?',
    answer: 'You can reach us through the Help & Support section in your Profile. Create a support ticket and our team will respond as soon as possible. You\'ll receive push notifications when we reply.',
  },
  {
    id: '24',
    category: 'Account & Support',
    question: 'How do I delete my account?',
    answer: 'If you wish to delete your account and all associated data, please contact us through the Help & Support section. We\'ll process your request and permanently remove all your data from our servers.',
  },
];

const CATEGORIES = [...new Set(FAQ_DATA.map(item => item.category))];

export default function FAQScreen() {
  const { colors } = useTheme();
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

  const filteredFAQ = selectedCategory
    ? FAQ_DATA.filter(item => item.category === selectedCategory)
    : FAQ_DATA;

  const groupedFAQ = filteredFAQ.reduce((acc, item) => {
    if (!acc[item.category]) {
      acc[item.category] = [];
    }
    acc[item.category].push(item);
    return acc;
  }, {} as Record<string, FAQItem[]>);

  return (
    <ThemedBackground style={styles.container}>
      <PageHeader title="FAQ" showBack />
      
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
              All
            </Text>
          </Pressable>
          {CATEGORIES.map(category => (
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
                {category}
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
              {category}
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
            Can't find what you're looking for?
          </Text>
          <Text style={[styles.footerSubtext, { color: colors.textSecondary }]}>
            Contact us through Help & Support in your Profile.
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
