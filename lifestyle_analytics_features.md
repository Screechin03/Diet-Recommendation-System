# 💊 Lifestyle Analytics & Medication Guide - Enhanced Features

## Overview
The Diet Planner now includes comprehensive lifestyle analytics that analyze medications, food aversions, and cravings to provide personalized health insights and medication guidance.

## New Features Added

### 1. 💊 Medication Safety Analysis
- **Automatic Safety Categorization**: Medications are automatically categorized as:
  - ✅ **Safe**: Continue as directed (prenatal vitamins, folic acid, iron, calcium)
  - ⚠️ **Monitor**: Requires healthcare supervision (metformin, insulin, antidepressants)
  - 🚨 **Avoid**: Potentially harmful (ibuprofen, aspirin, isotretinoin)
  - ❓ **Unknown**: Need verification with healthcare provider

- **Smart Medication Guide**: Provides specific guidance for each medication:
  - Whether to increase, decrease, or continue current dosage
  - Timing recommendations (with/without food)
  - Interaction warnings with other medications
  - Alternative medication suggestions

### 2. 🍽️ Food Preferences Impact Analysis
- **Aversion Impact Assessment**: Analyzes how food aversions affect nutritional intake:
  - Identifies missing nutrients from avoided foods
  - Suggests alternative food sources
  - Calculates nutritional risk scores

- **Craving Analysis**: Evaluates food cravings for health impact:
  - Categorizes cravings as beneficial or concerning
  - Provides healthier alternatives for unhealthy cravings
  - Suggests portion control strategies

### 3. 📊 Comprehensive Lifestyle Dashboard
- **Health Score Calculation**: Real-time lifestyle health score (0-100) based on:
  - Medication safety profile
  - Food preference nutritional impact
  - Health condition severity
  - Activity level

- **Interactive Visualizations**: Multiple charts showing:
  - Medication safety distribution (pie chart)
  - Food preferences balance (scatter plot)
  - Lifestyle risk factors (pie chart)
  - Health trend projections (line chart)

### 4. 🔍 Smart AI-Powered Recommendations
- **Priority-Based Alerts**:
  - 🚨 **URGENT**: Immediate action required (unsafe medications)
  - ⚠️ **Important**: Monitor closely (medications needing supervision)
  - 💡 **Suggestions**: Consider these options (optimization tips)

- **Personalized Action Plans**:
  - Medication schedule optimization
  - Nutritional gap bridging strategies
  - Smart craving management techniques
  - Safe pregnancy fitness recommendations

## Key Analytics Features

### Medication Intelligence
```python
# Example medication analysis output:
{
    'safe_medications': ['Prenatal Vitamin', 'Folic Acid'],
    'caution_medications': ['Metformin'],
    'avoid_medications': ['Ibuprofen'],
    'recommendations': ['Consult about XYZ medication']
}
```

### Food Preference Impact
```python
# Example food analysis:
{
    'concerning_aversions': [
        {
            'food': 'Dairy products',
            'missed_nutrients': ['calcium', 'protein', 'vitamin d'],
            'alternatives': ['fortified plant milk', 'tofu', 'tahini']
        }
    ],
    'nutritional_risks': [
        {
            'food': 'Ice cream',
            'risk': 'High in sugar/unhealthy fats',
            'healthier_alternatives': ['frozen yogurt', 'banana ice cream']
        }
    ]
}
```

### Lifestyle Health Score Calculation
- **Base Score**: 100 points
- **Medication Deductions**:
  - Unsafe medications: -20 points each
  - Medications needing monitoring: -10 points each
- **Food Preference Impact**:
  - Concerning aversions: -5 points each
  - Risky cravings: -8 points each
  - Beneficial cravings: +3 points each
- **Health Condition Impact**:
  - Gestational diabetes: -15 points
  - Anemia: -10 points
  - Other conditions: -3 to -5 points each

## User Benefits

### 1. Medication Safety
- **Immediate Alerts**: Know instantly if any medication needs attention
- **Timing Optimization**: Best times to take medications for maximum absorption
- **Interaction Prevention**: Avoid harmful drug-nutrient interactions

### 2. Nutritional Optimization
- **Gap Identification**: Spot nutritional deficiencies from food aversions
- **Smart Substitutions**: Get practical alternatives for avoided foods
- **Craving Management**: Transform unhealthy cravings into healthy choices

### 3. Personalized Guidance
- **Real-time Scoring**: Track lifestyle health improvements
- **Action-Oriented**: Specific steps to improve health outcomes
- **Evidence-Based**: Recommendations based on pregnancy research

## Integration with Existing Features

### Enhanced Health Recommendations
- Lifestyle factors now influence all health recommendations
- Medication interactions considered in nutritional advice
- Food preferences integrated into meal planning suggestions

### Improved Analytics Dashboard
- 4 new sections added to lifestyle analytics
- Interactive charts showing lifestyle health trends
- Smart suggestions based on individual lifestyle patterns

## Technical Implementation

### New Classes & Methods
- `analyze_medication_interactions()`: Medication safety analysis
- `analyze_food_preferences_impact()`: Food preference nutritional impact
- `get_lifestyle_adjusted_recommendations()`: Lifestyle-based recommendations
- `display_lifestyle_analytics()`: Complete lifestyle dashboard
- `_calculate_lifestyle_health_score()`: Health scoring algorithm
- `_generate_smart_suggestions()`: AI-powered recommendations

### Enhanced Visualizations
- **Plotly Integration**: 8 new interactive charts
- **Multi-panel Dashboards**: Comprehensive lifestyle overview
- **Real-time Updates**: Dynamic scoring and recommendations

## Usage Example

1. **Input Lifestyle Data**: 
   - Medications: "Prenatal vitamin, Metformin, Ibuprofen"
   - Aversions: "Dairy products, Leafy greens"
   - Cravings: "Ice cream, Chocolate"

2. **Receive Analysis**:
   - ✅ Prenatal vitamin: Continue as directed
   - ⚠️ Metformin: Monitor blood sugar closely
   - 🚨 Ibuprofen: STOP - Use acetaminophen instead
   - 💡 Alternative calcium sources for dairy aversion
   - 🍓 Healthier sweet options for cravings

3. **Get Health Score**: 
   - Current Score: 72/100
   - Key Issues: Unsafe medication (-20), Calcium deficiency risk (-8)
   - Action Plan: Replace ibuprofen, add calcium-rich alternatives

## Benefits for Pregnancy Health

- **Safer Medication Management**: Reduced risk of medication-related complications
- **Better Nutritional Outcomes**: Optimized nutrition despite food aversions
- **Informed Decision Making**: Evidence-based lifestyle choices
- **Proactive Health Monitoring**: Early identification of potential issues
- **Personalized Care**: Recommendations tailored to individual lifestyle
