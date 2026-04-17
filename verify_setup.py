"""
Verify Model Training and System Setup
This script checks if all models are trained and ready to use.
"""

import os
import sys

def check_file_exists(filepath, description):
    """Check if a file exists and print status"""
    exists = os.path.exists(filepath)
    status = "✓" if exists else "✗"
    
    if exists:
        size = os.path.getsize(filepath)
        if size > 1024 * 1024:
            size_str = f"{size / (1024*1024):.2f} MB"
        elif size > 1024:
            size_str = f"{size / 1024:.2f} KB"
        else:
            size_str = f"{size} bytes"
        print(f"  {status} {description}: {filepath}")
        print(f"    Size: {size_str}")
    else:
        print(f"  {status} {description}: NOT FOUND")
        print(f"    Expected at: {filepath}")
    
    return exists

def test_model_loading():
    """Test if the model can be loaded"""
    try:
        sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'FastAPI_Backend'))
        from pregnancy_ml_predictor import PregnancyRiskPredictor
        
        predictor = PregnancyRiskPredictor()
        model_path = os.path.join(os.path.dirname(__file__), 'FastAPI_Backend', 'pregnancy_risk_model.pkl')
        
        success = predictor.load_model(model_path)
        
        if success:
            print("  ✓ Model loaded successfully")
            print(f"    Available models: {list(predictor.models.keys())}")
            print(f"    Number of features: {len(predictor.feature_names)}")
            return True
        else:
            print("  ✗ Failed to load model")
            return False
            
    except Exception as e:
        print(f"  ✗ Error loading model: {e}")
        return False

def test_prediction():
    """Test if predictions work"""
    try:
        sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'FastAPI_Backend'))
        from pregnancy_ml_predictor import PregnancyRiskPredictor
        
        predictor = PregnancyRiskPredictor()
        model_path = os.path.join(os.path.dirname(__file__), 'FastAPI_Backend', 'pregnancy_risk_model.pkl')
        predictor.load_model(model_path)
        
        # Test data
        test_patient = {
            'age': 30,
            'systolic_bp': 120,
            'diastolic_bp': 80,
            'blood_sugar': 7.0,
            'body_temp': 98.6,
            'bmi': 23.0,
            'heart_rate': 72,
            'previous_complications': False,
            'preexisting_diabetes': False,
            'gestational_diabetes': False,
            'mental_health_issues': False
        }
        
        prediction = predictor.predict_risk(test_patient)
        
        if prediction:
            print("  ✓ Prediction successful")
            print(f"    Risk Level: {prediction['risk_level']}")
            print(f"    Confidence: {prediction['confidence']:.2%}")
            return True
        else:
            print("  ✗ Prediction returned None")
            return False
            
    except Exception as e:
        print(f"  ✗ Error making prediction: {e}")
        return False

def main():
    print("=" * 80)
    print("SYSTEM VERIFICATION")
    print("=" * 80)
    print()
    
    all_checks_passed = True
    
    # Check data files
    print("📊 Checking Data Files:")
    data_files = [
        ('Data/health_data.csv', 'Health training data'),
        ('Data/dataset.csv', 'Recipe database'),
    ]
    
    for filepath, description in data_files:
        full_path = os.path.join(os.path.dirname(__file__), filepath)
        exists = check_file_exists(full_path, description)
        all_checks_passed = all_checks_passed and exists
    
    print()
    
    # Check model files
    print("🤖 Checking Model Files:")
    model_file = os.path.join(os.path.dirname(__file__), 'FastAPI_Backend', 'pregnancy_risk_model.pkl')
    model_exists = check_file_exists(model_file, 'Trained pregnancy risk model')
    
    print()
    
    # Check backend files
    print("🔧 Checking Backend Files:")
    backend_files = [
        ('FastAPI_Backend/main.py', 'FastAPI backend'),
        ('FastAPI_Backend/model.py', 'Recipe recommendation model'),
        ('FastAPI_Backend/pregnancy_ml_predictor.py', 'ML predictor'),
        ('FastAPI_Backend/requirements.txt', 'Backend dependencies'),
    ]
    
    for filepath, description in backend_files:
        full_path = os.path.join(os.path.dirname(__file__), filepath)
        exists = check_file_exists(full_path, description)
        all_checks_passed = all_checks_passed and exists
    
    print()
    
    # Check frontend files
    print("🎨 Checking Frontend Files:")
    frontend_files = [
        ('Streamlit_Frontend/Hello.py', 'Streamlit main app'),
        ('Streamlit_Frontend/pages/1_Diet_Planner.py', 'Diet Planner page'),
        ('Streamlit_Frontend/pages/2_Recipe_Finder.py', 'Recipe Finder page'),
        ('Streamlit_Frontend/requirements.txt', 'Frontend dependencies'),
    ]
    
    for filepath, description in frontend_files:
        full_path = os.path.join(os.path.dirname(__file__), filepath)
        exists = check_file_exists(full_path, description)
        all_checks_passed = all_checks_passed and exists
    
    print()
    
    # Test model loading
    if model_exists:
        print("🧪 Testing Model Loading:")
        model_loads = test_model_loading()
        print()
        
        # Test prediction
        if model_loads:
            print("🎯 Testing Prediction:")
            prediction_works = test_prediction()
            all_checks_passed = all_checks_passed and prediction_works
            print()
    else:
        print("⚠️  Skipping model tests (model file not found)")
        print("   Run 'python train_models.py' to train the model")
        all_checks_passed = False
        print()
    
    # Summary
    print("=" * 80)
    print("VERIFICATION SUMMARY")
    print("=" * 80)
    
    if all_checks_passed:
        print("✅ All checks passed! Your system is ready to use.")
        print()
        print("Next steps:")
        print("  1. Start the backend:")
        print("     cd FastAPI_Backend && python run_server.py")
        print()
        print("  2. Start the frontend (in a new terminal):")
        print("     cd Streamlit_Frontend && streamlit run Hello.py")
        print()
        print("  3. Open your browser to: http://localhost:8501")
    else:
        print("❌ Some checks failed. Please review the errors above.")
        print()
        if not model_exists:
            print("⚠️  Model not found. Run: python train_models.py")
        print()
        print("For help, see:")
        print("  - QUICK_START_TRAINING.md")
        print("  - TRAINING_GUIDE.md")
        print("  - README.md")
    
    print("=" * 80)
    
    return all_checks_passed

if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)
