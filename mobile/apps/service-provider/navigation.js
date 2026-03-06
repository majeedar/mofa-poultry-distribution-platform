import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';

import LoginScreen                from './screens/LoginScreen';
import IncomingAllocationScreen   from './screens/IncomingAllocationScreen';
import ConfirmReceiptScreen        from './screens/ConfirmReceiptScreen';
import FarmerAllocationScreen      from './screens/FarmerAllocationScreen';
import FarmerDistributionScreen    from './screens/FarmerDistributionScreen';
import DistributionProgressScreen  from './screens/DistributionProgressScreen';

const Stack = createStackNavigator();

export default function SPNavigation() {
  return (
    <NavigationContainer>
      <Stack.Navigator
        initialRouteName="Login"
        screenOptions={{
          headerStyle:        { backgroundColor: '#006B3F' },
          headerTintColor:    '#fff',
          headerTitleStyle:   { fontWeight: 'bold' },
          cardStyle:          { backgroundColor: '#f8fafb' },
        }}
      >
        <Stack.Screen name="Login"               component={LoginScreen}               options={{ headerShown: false }} />
        <Stack.Screen name="IncomingAllocation"  component={IncomingAllocationScreen}  options={{ title: 'Incoming Allocation' }} />
        <Stack.Screen name="ConfirmReceipt"      component={ConfirmReceiptScreen}       options={{ title: 'Confirm Receipt' }} />
        <Stack.Screen name="FarmerAllocation"    component={FarmerAllocationScreen}    options={{ title: 'Plan Farmer Allocations' }} />
        <Stack.Screen name="FarmerDistribution"  component={FarmerDistributionScreen}  options={{ title: 'Farmer Distribution' }} />
        <Stack.Screen name="DistributionProgress" component={DistributionProgressScreen} options={{ title: 'Distribution Progress' }} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
