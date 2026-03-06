import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import LoginScreen       from './screens/LoginScreen';
import ActiveBatchScreen from './screens/ActiveBatchScreen';
import SPDeliveryScreen  from './screens/SPDeliveryScreen';
import SyncStatusScreen  from './screens/SyncStatusScreen';

const Stack = createNativeStackNavigator();

export default function DistributorNav() {
  return (
    <NavigationContainer>
      <Stack.Navigator
        initialRouteName="Login"
        screenOptions={{ headerStyle: { backgroundColor: '#006B3F' }, headerTintColor: '#fff', headerTitleStyle: { fontWeight: 'bold' } }}
      >
        <Stack.Screen name="Login"       component={LoginScreen}       options={{ headerShown: false }} />
        <Stack.Screen name="ActiveBatch" component={ActiveBatchScreen} options={{ title: 'My Batch' }} />
        <Stack.Screen name="SPDelivery"  component={SPDeliveryScreen}  options={{ title: 'SP Delivery' }} />
        <Stack.Screen name="SyncStatus"  component={SyncStatusScreen}  options={{ title: 'Sync Status' }} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
