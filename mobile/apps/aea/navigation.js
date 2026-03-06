import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';

import LoginScreen          from './screens/LoginScreen';
import AEADashboardScreen   from './screens/AEADashboardScreen';
import FarmVisitScreen      from './screens/FarmVisitScreen';
import MortalityReviewScreen from './screens/MortalityReviewScreen';
import FarmerListScreen     from './screens/FarmerListScreen';
import FarmerRegisterScreen from './screens/FarmerRegisterScreen';
import FarmerUploadScreen   from './screens/FarmerUploadScreen';

const Stack = createStackNavigator();

export default function AEANavigation() {
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
        <Stack.Screen name="Login"           component={LoginScreen}           options={{ headerShown: false }} />
        <Stack.Screen name="AEADashboard"    component={AEADashboardScreen}    options={{ title: 'AEA Dashboard', headerLeft: () => null }} />
        <Stack.Screen name="FarmVisit"       component={FarmVisitScreen}       options={{ title: 'Farm Visit' }} />
        <Stack.Screen name="MortalityReview" component={MortalityReviewScreen} options={{ title: 'Mortality Review' }} />
        <Stack.Screen name="FarmerList"      component={FarmerListScreen}      options={{ title: 'My Farmers' }} />
        <Stack.Screen name="FarmerRegister"  component={FarmerRegisterScreen}  options={{ title: 'Register Farmer' }} />
        <Stack.Screen name="FarmerUpload"    component={FarmerUploadScreen}    options={{ title: 'Upload Farmers' }} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
