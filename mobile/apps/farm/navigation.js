import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';

import LoginScreen           from './screens/LoginScreen';
import IncomingDeliveryScreen from './screens/IncomingDeliveryScreen';
import DailyEntryScreen      from './screens/DailyEntryScreen';
import MortalityPhotoScreen  from './screens/MortalityPhotoScreen';
import EntryHistoryScreen    from './screens/EntryHistoryScreen';
import DocsStatsScreen       from './screens/DocsStatsScreen';

const Stack = createStackNavigator();

export default function FarmNavigation() {
  return (
    <NavigationContainer>
      <Stack.Navigator
        initialRouteName="Login"
        screenOptions={{
          headerStyle:      { backgroundColor: '#006B3F' },
          headerTintColor:  '#fff',
          headerTitleStyle: { fontWeight: 'bold' },
          cardStyle:        { backgroundColor: '#f8fafb' },
        }}
      >
        <Stack.Screen name="Login"            component={LoginScreen}            options={{ headerShown: false }} />
        <Stack.Screen name="IncomingDelivery" component={IncomingDeliveryScreen} options={{ title: 'Incoming DoCs' }} />
        <Stack.Screen name="DailyEntry"       component={DailyEntryScreen}       options={{ title: 'Daily Entry' }} />
        <Stack.Screen name="MortalityPhoto"   component={MortalityPhotoScreen}   options={{ title: 'Mortality Photo' }} />
        <Stack.Screen name="EntryHistory"     component={EntryHistoryScreen}     options={{ title: 'Entry History' }} />
        <Stack.Screen name="DocsStats"        component={DocsStatsScreen}        options={{ title: 'My DoC Statistics' }} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
