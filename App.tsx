import { StatusBar } from 'expo-status-bar';
import { SafeAreaView, useColorScheme } from 'react-native';
import CharacterSheet from './src/screens/CharacterSheet';

export default function App() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  return (
    <SafeAreaView style={{ flex: 1 }}>
      <CharacterSheet />
      <StatusBar style={isDark ? 'light' : 'dark'} />
    </SafeAreaView>
  );
}
