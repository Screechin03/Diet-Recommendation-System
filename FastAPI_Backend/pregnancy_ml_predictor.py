import pandas as pd
import numpy as np
import pickle
import os
from sklearn.ensemble import RandomForestClassifier, GradientBoostingClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import train_test_split, cross_val_score, GridSearchCV
from sklearn.preprocessing import StandardScaler, LabelEncoder
from sklearn.metrics import classification_report, confusion_matrix, accuracy_score
from sklearn.impute import SimpleImputer
import joblib
import warnings
warnings.filterwarnings('ignore')

class PregnancyRiskPredictor:
    """Advanced ML model for pregnancy risk prediction and health analytics"""
    
    def __init__(self):
        self.models = {}
        self.scalers = {}
        self.feature_names = []
        self.is_trained = False
        self.feature_importance = {}
        
    def prepare_data(self, data_path):
        """Load and prepare the health dataset"""
        try:
            # Read the CSV file
            df = pd.read_csv(data_path)
            
            # Handle missing values and data cleaning
            df = self._clean_data(df)
            
            # Feature engineering
            df = self._engineer_features(df)
            
            return df
        except Exception as e:
            print(f"Error loading data: {e}")
            return None
    
    def _clean_data(self, df):
        """Clean and preprocess the dataset"""
        # Handle missing values in BMI and other numeric columns
        numeric_columns = ['Age', 'Systolic BP', 'Diastolic', 'BS', 'Body Temp', 'BMI', 'Heart Rate']
        
        for col in numeric_columns:
            if col in df.columns:
                # Fill missing values with median
                median_val = df[col].median()
                df[col].fillna(median_val, inplace=True)
                
                # Remove extreme outliers
                Q1 = df[col].quantile(0.25)
                Q3 = df[col].quantile(0.75)
                IQR = Q3 - Q1
                lower_bound = Q1 - 1.5 * IQR
                upper_bound = Q3 + 1.5 * IQR
                df[col] = np.where(df[col] < lower_bound, lower_bound, df[col])
                df[col] = np.where(df[col] > upper_bound, upper_bound, df[col])
        
        # Handle binary columns
        binary_columns = ['Previous Complications', 'Preexisting Diabetes', 'Gestational Diabetes', 'Mental Health']
        for col in binary_columns:
            if col in df.columns:
                df[col].fillna(0, inplace=True)
                df[col] = df[col].astype(int)
        
        # Handle target variable
        if 'Risk Level' in df.columns:
            df['Risk Level'].fillna('Low', inplace=True)
            df['Risk_Binary'] = (df['Risk Level'] == 'High').astype(int)
        
        return df
    
    def _engineer_features(self, df):
        """Create additional features for better prediction"""
        # BMI categories
        if 'BMI' in df.columns:
            df['BMI_Category'] = pd.cut(df['BMI'], 
                                      bins=[0, 18.5, 25, 30, 100], 
                                      labels=['Underweight', 'Normal', 'Overweight', 'Obese'])
            df['BMI_Category'] = df['BMI_Category'].cat.codes
        
        # Age categories
        if 'Age' in df.columns:
            df['Age_Category'] = pd.cut(df['Age'], 
                                      bins=[0, 20, 30, 40, 100], 
                                      labels=['Teen', 'Young Adult', 'Adult', 'Mature'])
            df['Age_Category'] = df['Age_Category'].cat.codes
        
        # Blood pressure categories
        if all(col in df.columns for col in ['Systolic BP', 'Diastolic']):
            df['BP_Category'] = np.where((df['Systolic BP'] >= 140) | (df['Diastolic'] >= 90), 1, 0)  # Hypertension
            df['Pulse_Pressure'] = df['Systolic BP'] - df['Diastolic']
        
        # Blood sugar categories
        if 'BS' in df.columns:
            df['BS_Category'] = np.where(df['BS'] > 7.8, 1, 0)  # High blood sugar
        
        # Composite risk scores
        if all(col in df.columns for col in ['Previous Complications', 'Preexisting Diabetes', 'Gestational Diabetes']):
            df['Diabetes_Risk_Score'] = df['Preexisting Diabetes'] + df['Gestational Diabetes']
            df['Overall_Complication_Score'] = (df['Previous Complications'] + 
                                               df['Preexisting Diabetes'] + 
                                               df['Gestational Diabetes'] + 
                                               df['Mental Health'])
        
        return df
    
    def train_models(self, df):
        """Train multiple ML models for prediction"""
        # Define features and target
        feature_columns = ['Age', 'Systolic BP', 'Diastolic', 'BS', 'Body Temp', 'BMI', 'Heart Rate',
                          'Previous Complications', 'Preexisting Diabetes', 'Gestational Diabetes', 'Mental Health',
                          'BMI_Category', 'Age_Category', 'BP_Category', 'Pulse_Pressure', 'BS_Category',
                          'Diabetes_Risk_Score', 'Overall_Complication_Score']
        
        # Filter available features
        available_features = [col for col in feature_columns if col in df.columns]
        self.feature_names = available_features
        
        X = df[available_features]
        y = df['Risk_Binary']
        
        # Split data
        X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42, stratify=y)
        
        # Scale features
        scaler = StandardScaler()
        X_train_scaled = scaler.fit_transform(X_train)
        X_test_scaled = scaler.transform(X_test)
        self.scalers['main'] = scaler
        
        # Train multiple models
        models_config = {
            'random_forest': RandomForestClassifier(n_estimators=100, random_state=42, max_depth=10),
            'gradient_boosting': GradientBoostingClassifier(n_estimators=100, random_state=42, max_depth=5),
            'logistic_regression': LogisticRegression(random_state=42, max_iter=1000)
        }
        
        results = {}
        
        for name, model in models_config.items():
            if name == 'logistic_regression':
                # Use scaled data for logistic regression
                model.fit(X_train_scaled, y_train)
                y_pred = model.predict(X_test_scaled)
                self.models[name] = {'model': model, 'scaler': scaler}
            else:
                # Use original data for tree-based models
                model.fit(X_train, y_train)
                y_pred = model.predict(X_test)
                self.models[name] = {'model': model, 'scaler': None}
            
            # Calculate metrics
            accuracy = accuracy_score(y_test, y_pred)
            cv_scores = cross_val_score(model, X_train_scaled if name == 'logistic_regression' else X_train, 
                                      y_train, cv=5, scoring='accuracy')
            
            results[name] = {
                'accuracy': accuracy,
                'cv_mean': cv_scores.mean(),
                'cv_std': cv_scores.std()
            }
            
            # Store feature importance for tree-based models
            if hasattr(model, 'feature_importances_'):
                self.feature_importance[name] = dict(zip(available_features, model.feature_importances_))
        
        self.is_trained = True
        return results
    
    def predict_risk(self, patient_data, model_name='random_forest'):
        """Predict pregnancy risk for a single patient"""
        if not self.is_trained:
            return None
        
        try:
            # Prepare patient data
            input_data = self._prepare_patient_data(patient_data)
            
            # Get the model
            model_info = self.models.get(model_name, self.models['random_forest'])
            model = model_info['model']
            scaler = model_info['scaler']
            
            # Make prediction
            if scaler:
                input_scaled = scaler.transform([input_data])
                risk_prob = model.predict_proba(input_scaled)[0]
            else:
                risk_prob = model.predict_proba([input_data])[0]
            
            # Get prediction details
            risk_prediction = {
                'risk_probability': float(risk_prob[1]),  # Probability of high risk
                'risk_level': 'High' if risk_prob[1] > 0.5 else 'Low',
                'confidence': float(max(risk_prob)),
                'risk_factors': self._identify_risk_factors(patient_data)
            }
            
            return risk_prediction
        except Exception as e:
            print(f"Error in prediction: {e}")
            return None
    
    def _prepare_patient_data(self, patient_data):
        """Convert patient data to model input format"""
        # Create feature vector based on training features
        feature_vector = []
        
        for feature in self.feature_names:
            if feature == 'Age':
                feature_vector.append(patient_data.get('age', 25))
            elif feature == 'Systolic BP':
                feature_vector.append(patient_data.get('systolic_bp', 120))
            elif feature == 'Diastolic':
                feature_vector.append(patient_data.get('diastolic_bp', 80))
            elif feature == 'BS':
                feature_vector.append(patient_data.get('blood_sugar', 7.0))
            elif feature == 'Body Temp':
                feature_vector.append(patient_data.get('body_temp', 98.6))
            elif feature == 'BMI':
                feature_vector.append(patient_data.get('bmi', 22.0))
            elif feature == 'Heart Rate':
                feature_vector.append(patient_data.get('heart_rate', 75))
            elif feature == 'Previous Complications':
                feature_vector.append(1 if patient_data.get('previous_complications', False) else 0)
            elif feature == 'Preexisting Diabetes':
                feature_vector.append(1 if patient_data.get('preexisting_diabetes', False) else 0)
            elif feature == 'Gestational Diabetes':
                feature_vector.append(1 if patient_data.get('gestational_diabetes', False) else 0)
            elif feature == 'Mental Health':
                feature_vector.append(1 if patient_data.get('mental_health_issues', False) else 0)
            elif feature == 'BMI_Category':
                bmi = patient_data.get('bmi', 22.0)
                if bmi < 18.5:
                    feature_vector.append(0)  # Underweight
                elif bmi < 25:
                    feature_vector.append(1)  # Normal
                elif bmi < 30:
                    feature_vector.append(2)  # Overweight
                else:
                    feature_vector.append(3)  # Obese
            elif feature == 'Age_Category':
                age = patient_data.get('age', 25)
                if age < 20:
                    feature_vector.append(0)  # Teen
                elif age < 30:
                    feature_vector.append(1)  # Young Adult
                elif age < 40:
                    feature_vector.append(2)  # Adult
                else:
                    feature_vector.append(3)  # Mature
            elif feature == 'BP_Category':
                systolic = patient_data.get('systolic_bp', 120)
                diastolic = patient_data.get('diastolic_bp', 80)
                feature_vector.append(1 if systolic >= 140 or diastolic >= 90 else 0)
            elif feature == 'Pulse_Pressure':
                systolic = patient_data.get('systolic_bp', 120)
                diastolic = patient_data.get('diastolic_bp', 80)
                feature_vector.append(systolic - diastolic)
            elif feature == 'BS_Category':
                bs = patient_data.get('blood_sugar', 7.0)
                feature_vector.append(1 if bs > 7.8 else 0)
            elif feature == 'Diabetes_Risk_Score':
                preexisting = 1 if patient_data.get('preexisting_diabetes', False) else 0
                gestational = 1 if patient_data.get('gestational_diabetes', False) else 0
                feature_vector.append(preexisting + gestational)
            elif feature == 'Overall_Complication_Score':
                complications = 1 if patient_data.get('previous_complications', False) else 0
                preexisting = 1 if patient_data.get('preexisting_diabetes', False) else 0
                gestational = 1 if patient_data.get('gestational_diabetes', False) else 0
                mental = 1 if patient_data.get('mental_health_issues', False) else 0
                feature_vector.append(complications + preexisting + gestational + mental)
            else:
                feature_vector.append(0)  # Default value
        
        return feature_vector
    
    def _identify_risk_factors(self, patient_data):
        """Identify specific risk factors for the patient"""
        risk_factors = []
        
        # Age-related risks
        age = patient_data.get('age', 25)
        if age < 18:
            risk_factors.append("Very young maternal age (increased risk of complications)")
        elif age > 35:
            risk_factors.append("Advanced maternal age (increased risk of chromosomal abnormalities)")
        
        # BMI-related risks
        bmi = patient_data.get('bmi', 22.0)
        if bmi < 18.5:
            risk_factors.append("Underweight (risk of low birth weight baby)")
        elif bmi > 30:
            risk_factors.append("Obesity (increased risk of gestational diabetes and hypertension)")
        
        # Blood pressure risks
        systolic = patient_data.get('systolic_bp', 120)
        diastolic = patient_data.get('diastolic_bp', 80)
        if systolic >= 140 or diastolic >= 90:
            risk_factors.append("Hypertension (risk of preeclampsia)")
        
        # Blood sugar risks
        bs = patient_data.get('blood_sugar', 7.0)
        if bs > 7.8:
            risk_factors.append("High blood sugar (risk of gestational diabetes)")
        
        # Medical history risks
        if patient_data.get('previous_complications', False):
            risk_factors.append("Previous pregnancy complications (higher risk of recurrence)")
        
        if patient_data.get('preexisting_diabetes', False):
            risk_factors.append("Preexisting diabetes (requires careful monitoring)")
        
        if patient_data.get('gestational_diabetes', False):
            risk_factors.append("Current gestational diabetes (requires dietary management)")
        
        if patient_data.get('mental_health_issues', False):
            risk_factors.append("Mental health concerns (may affect pregnancy outcomes)")
        
        return risk_factors
    
    def get_recommendations(self, patient_data, risk_prediction):
        """Generate personalized recommendations based on risk assessment"""
        recommendations = {
            'immediate_actions': [],
            'lifestyle_changes': [],
            'monitoring_requirements': [],
            'medical_consultations': []
        }
        
        risk_level = risk_prediction['risk_level']
        risk_factors = risk_prediction['risk_factors']
        
        # High-risk recommendations
        if risk_level == 'High':
            recommendations['immediate_actions'].append("Schedule urgent consultation with high-risk pregnancy specialist")
            recommendations['monitoring_requirements'].append("Weekly prenatal visits")
            recommendations['monitoring_requirements'].append("Daily blood pressure monitoring")
            recommendations['monitoring_requirements'].append("Regular fetal monitoring")
        
        # Specific recommendations based on risk factors
        for factor in risk_factors:
            if "blood sugar" in factor.lower() or "diabetes" in factor.lower():
                recommendations['lifestyle_changes'].append("Follow strict diabetic diet plan")
                recommendations['monitoring_requirements'].append("Daily blood glucose monitoring")
                recommendations['medical_consultations'].append("Endocrinologist consultation")
            
            if "hypertension" in factor.lower() or "blood pressure" in factor.lower():
                recommendations['lifestyle_changes'].append("Reduce sodium intake")
                recommendations['lifestyle_changes'].append("Limit caffeine consumption")
                recommendations['monitoring_requirements'].append("Blood pressure monitoring twice daily")
                recommendations['medical_consultations'].append("Cardiologist consultation")
            
            if "weight" in factor.lower() or "bmi" in factor.lower():
                recommendations['lifestyle_changes'].append("Follow pregnancy-appropriate nutrition plan")
                recommendations['lifestyle_changes'].append("Gentle, supervised exercise routine")
                recommendations['medical_consultations'].append("Nutritionist consultation")
            
            if "mental health" in factor.lower():
                recommendations['medical_consultations'].append("Mental health counselor consultation")
                recommendations['lifestyle_changes'].append("Stress management and relaxation techniques")
        
        # General recommendations
        recommendations['lifestyle_changes'].extend([
            "Take prenatal vitamins daily",
            "Ensure adequate sleep (7-9 hours)",
            "Stay hydrated (8-10 glasses of water daily)",
            "Avoid alcohol and smoking completely"
        ])
        
        return recommendations
    
    def save_model(self, filepath):
        """Save the trained model to disk"""
        if self.is_trained:
            model_data = {
                'models': self.models,
                'scalers': self.scalers,
                'feature_names': self.feature_names,
                'feature_importance': self.feature_importance
            }
            joblib.dump(model_data, filepath)
            return True
        return False
    
    def load_model(self, filepath):
        """Load a pre-trained model from disk"""
        try:
            model_data = joblib.load(filepath)
            self.models = model_data['models']
            self.scalers = model_data['scalers']
            self.feature_names = model_data['feature_names']
            self.feature_importance = model_data['feature_importance']
            self.is_trained = True
            return True
        except Exception as e:
            print(f"Error loading model: {e}")
            return False

# Initialize and train the model when this module is imported
def initialize_pregnancy_predictor():
    """Initialize the pregnancy risk predictor"""
    predictor = PregnancyRiskPredictor()

    def _health_data_candidates():
        candidates = []
        env_path = os.getenv("HEALTH_DATA_PATH")
        if env_path:
            candidates.append(env_path)

        # Monorepo layout: ../Data/health_data.csv from this file
        candidates.append(
            os.path.abspath(
                os.path.join(os.path.dirname(__file__), "..", "Data", "health_data.csv")
            )
        )

        # Docker layout: /app/Data/health_data.csv when mounted
        candidates.append(
            os.path.abspath(
                os.path.join(os.path.dirname(__file__), "Data", "health_data.csv")
            )
        )

        # Absolute fallback
        candidates.append("/Data/health_data.csv")

        return candidates
    
    try:
        data_path = None
        for candidate in _health_data_candidates():
            if candidate and os.path.exists(candidate):
                data_path = candidate
                break

        if not data_path:
            print("Health data not found. Set HEALTH_DATA_PATH or mount Data/ to /app/Data.")
            return None

        # Load and prepare data
        df = predictor.prepare_data(data_path)
        if df is not None:
            # Train models
            results = predictor.train_models(df)
            print("Pregnancy Risk Predictor trained successfully!")
            print("Model Performance:")
            for model_name, metrics in results.items():
                print(f"  {model_name}: Accuracy = {metrics['accuracy']:.3f}, CV Score = {metrics['cv_mean']:.3f} (+/- {metrics['cv_std']:.3f})")
            
            # Save the trained model
            model_path = os.path.join(os.path.dirname(__file__), 'pregnancy_risk_model.pkl')
            predictor.save_model(model_path)
            return predictor
        else:
            print("Failed to load health data")
            return None
    except Exception as e:
        print(f"Error initializing pregnancy predictor: {e}")
        return None

# Global predictor instance
pregnancy_predictor = None

def get_pregnancy_predictor():
    """Get the global pregnancy predictor instance"""
    global pregnancy_predictor
    if pregnancy_predictor is None:
        pregnancy_predictor = initialize_pregnancy_predictor()
    return pregnancy_predictor
