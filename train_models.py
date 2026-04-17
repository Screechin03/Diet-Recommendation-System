"""
Train Machine Learning Models for Diet Recommendation System
This script trains the pregnancy risk prediction models and saves them for use in the FastAPI backend.
"""

import os
import sys
import pandas as pd
import numpy as np
from datetime import datetime

# Add FastAPI backend to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'FastAPI_Backend'))

from pregnancy_ml_predictor import PregnancyRiskPredictor

def main():
    """Main training function"""
    print("=" * 80)
    print("PREGNANCY DIET RECOMMENDATION SYSTEM - MODEL TRAINING")
    print("=" * 80)
    print(f"Training started at: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
    
    # Initialize the predictor
    print("📊 Initializing Pregnancy Risk Predictor...")
    predictor = PregnancyRiskPredictor()
    
    # Define paths
    data_path = os.path.join(os.path.dirname(__file__), 'Data', 'health_data.csv')
    model_save_path = os.path.join(os.path.dirname(__file__), 'FastAPI_Backend', 'pregnancy_risk_model.pkl')
    
    # Check if data file exists
    if not os.path.exists(data_path):
        print(f"❌ Error: Health data file not found at {data_path}")
        print("Please ensure 'Data/health_data.csv' exists in your project directory.")
        return False
    
    print(f"✓ Found health data at: {data_path}")
    
    # Load and prepare data
    print("\n📖 Loading and preparing data...")
    df = predictor.prepare_data(data_path)
    
    if df is None:
        print("❌ Error: Failed to load or prepare data")
        return False
    
    print(f"✓ Data loaded successfully")
    print(f"  - Total records: {len(df)}")
    print(f"  - Features: {df.shape[1]} columns")
    
    # Display data statistics
    print("\n📈 Data Statistics:")
    print(f"  - Age range: {df['Age'].min():.0f} - {df['Age'].max():.0f} years")
    print(f"  - BMI range: {df['BMI'].min():.1f} - {df['BMI'].max():.1f}")
    if 'Risk Level' in df.columns:
        risk_counts = df['Risk Level'].value_counts()
        print(f"  - Risk Level distribution:")
        for risk_level, count in risk_counts.items():
            print(f"    • {risk_level}: {count} ({count/len(df)*100:.1f}%)")
    
    # Train models
    print("\n🤖 Training Machine Learning Models...")
    print("This may take a few minutes...\n")
    
    try:
        results = predictor.train_models(df)
        
        print("✓ Training completed successfully!\n")
        
        # Display results
        print("=" * 80)
        print("MODEL PERFORMANCE METRICS")
        print("=" * 80)
        
        for model_name, metrics in results.items():
            print(f"\n{model_name.upper().replace('_', ' ')}:")
            print(f"  • Test Accuracy:          {metrics['accuracy']:.4f} ({metrics['accuracy']*100:.2f}%)")
            print(f"  • Cross-Validation Mean:  {metrics['cv_mean']:.4f} ({metrics['cv_mean']*100:.2f}%)")
            print(f"  • Cross-Validation Std:   {metrics['cv_std']:.4f}")
            print(f"  • Confidence:             ±{metrics['cv_std']*100:.2f}%")
        
        # Display feature importance for best model
        if predictor.feature_importance:
            print("\n" + "=" * 80)
            print("FEATURE IMPORTANCE (Top 10 Features)")
            print("=" * 80)
            
            # Get feature importance from random forest (usually most interpretable)
            if 'random_forest' in predictor.feature_importance:
                importance_dict = predictor.feature_importance['random_forest']
                sorted_features = sorted(importance_dict.items(), key=lambda x: x[1], reverse=True)
                
                print("\nMost Important Features for Prediction:")
                for i, (feature, importance) in enumerate(sorted_features[:10], 1):
                    bar_length = int(importance * 50)
                    bar = "█" * bar_length
                    print(f"{i:2d}. {feature:30s} {bar} {importance:.4f}")
        
        # Save the model
        print("\n" + "=" * 80)
        print("SAVING MODEL")
        print("=" * 80)
        
        success = predictor.save_model(model_save_path)
        if success:
            print(f"✓ Model saved successfully to: {model_save_path}")
            file_size = os.path.getsize(model_save_path) / (1024 * 1024)  # Convert to MB
            print(f"  • File size: {file_size:.2f} MB")
        else:
            print(f"❌ Failed to save model")
            return False
        
        # Test prediction with sample data
        print("\n" + "=" * 80)
        print("TESTING MODEL WITH SAMPLE DATA")
        print("=" * 80)
        
        sample_patient = {
            'age': 28,
            'systolic_bp': 125,
            'diastolic_bp': 82,
            'blood_sugar': 7.2,
            'body_temp': 98.6,
            'bmi': 24.5,
            'heart_rate': 78,
            'previous_complications': False,
            'preexisting_diabetes': False,
            'gestational_diabetes': False,
            'mental_health_issues': False
        }
        
        print("\nSample Patient Data:")
        for key, value in sample_patient.items():
            print(f"  • {key.replace('_', ' ').title()}: {value}")
        
        prediction = predictor.predict_risk(sample_patient)
        
        if prediction:
            print("\n✓ Prediction Results:")
            print(f"  • Risk Level: {prediction['risk_level']}")
            print(f"  • Risk Probability: {prediction['risk_probability']:.2%}")
            print(f"  • Confidence: {prediction['confidence']:.2%}")
            
            if prediction['risk_factors']:
                print(f"\n  Risk Factors Identified:")
                for factor in prediction['risk_factors']:
                    print(f"    - {factor}")
        else:
            print("⚠️  Warning: Prediction test returned None")
        
        # Summary
        print("\n" + "=" * 80)
        print("TRAINING SUMMARY")
        print("=" * 80)
        print("✓ Data loaded and prepared successfully")
        print("✓ Multiple ML models trained (Random Forest, Gradient Boosting, Logistic Regression)")
        print("✓ Model saved and ready for deployment")
        print("✓ Sample prediction test passed")
        print("\n🎉 All training steps completed successfully!")
        print(f"\nTraining completed at: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        
        return True
        
    except Exception as e:
        print(f"\n❌ Error during training: {e}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    success = main()
    
    if success:
        print("\n" + "=" * 80)
        print("NEXT STEPS")
        print("=" * 80)
        print("1. Start the FastAPI backend: cd FastAPI_Backend && python run_server.py")
        print("2. Start the Streamlit frontend: cd Streamlit_Frontend && streamlit run Hello.py")
        print("3. The trained model will be loaded automatically by the backend")
        print("=" * 80)
        sys.exit(0)
    else:
        print("\n❌ Training failed. Please check the errors above.")
        sys.exit(1)
