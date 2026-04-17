# Model Training Guide

## Overview

This guide explains how the machine learning models in the Diet Recommendation System work and how to train them.

## Two Types of Models

### 1. Recipe Recommendation Model (Dynamic Training)
**File:** `FastAPI_Backend/model.py`

This model uses **K-Nearest Neighbors (KNN)** with cosine similarity and is trained **dynamically** on-the-fly:

- **How it works:** 
  - When a recipe recommendation request comes in, the system:
    1. Filters the recipe dataset based on dietary restrictions and ingredients
    2. Scales the nutritional data using `StandardScaler`
    3. Fits a `NearestNeighbors` model on the filtered data
    4. Creates a pipeline with scaler and KNN
    5. Returns the most similar recipes based on nutritional requirements

- **Why dynamic training?**
  - The dataset is filtered differently for each user (dietary restrictions, ingredients, etc.)
  - Training happens in milliseconds on small filtered datasets
  - Always uses the most relevant recipes for the specific query

- **No pre-training needed** - this model trains itself during each API request!

### 2. Pregnancy Risk Prediction Model (Pre-trained)
**File:** `FastAPI_Backend/pregnancy_ml_predictor.py`

This model uses multiple ML algorithms and needs to be **pre-trained**:

- **Models included:**
  - Random Forest Classifier (best for interpretability)
  - Gradient Boosting Classifier (best for accuracy)
  - Logistic Regression (fastest for inference)

- **Training data:** `Data/health_data.csv`
- **Saved model:** `FastAPI_Backend/pregnancy_risk_model.pkl`

## Training the Pregnancy Risk Prediction Model

### Prerequisites

1. Ensure you have the required dependencies installed:
```bash
pip install -r FastAPI_Backend/requirements.txt
```

2. Ensure the health dataset exists:
```bash
# Check if the file exists
ls Data/health_data.csv
```

### Training Steps

#### Option 1: Using the Training Script (Recommended)

Run the standalone training script:
```bash
python train_models.py
```

This will:
- Load and clean the health data
- Engineer additional features
- Train three ML models
- Display performance metrics
- Save the trained model to `FastAPI_Backend/pregnancy_risk_model.pkl`
- Run a test prediction

Expected output:
```
================================================================================
PREGNANCY DIET RECOMMENDATION SYSTEM - MODEL TRAINING
================================================================================
Training started at: 2025-11-29 10:30:00

📊 Initializing Pregnancy Risk Predictor...
✓ Found health data at: /path/to/Data/health_data.csv

📖 Loading and preparing data...
✓ Data loaded successfully
  - Total records: 1000
  - Features: 25 columns

🤖 Training Machine Learning Models...

✓ Training completed successfully!

MODEL PERFORMANCE METRICS
================================================================================

RANDOM FOREST:
  • Test Accuracy:          0.9920 (99.20%)
  • Cross-Validation Mean:  0.9880 (98.80%)
  • Cross-Validation Std:   0.0120
  • Confidence:             ±1.20%

...
```

#### Option 2: Using the Backend Initialization

The model can also be trained automatically when the backend starts:

1. Make sure `Data/health_data.csv` exists
2. Start the backend:
```bash
cd FastAPI_Backend
python run_server.py
```

The `pregnancy_ml_predictor.py` module will automatically:
- Detect if no saved model exists
- Train the models
- Save them for future use

### Verifying the Trained Model

Check if the model was saved successfully:
```bash
ls -lh FastAPI_Backend/pregnancy_risk_model.pkl
```

Test the model via API:
```bash
curl http://localhost:8080/model_performance
```

Expected response:
```json
{
  "model_trained": true,
  "available_models": ["random_forest", "gradient_boosting", "logistic_regression"],
  "feature_importance": {...},
  "success": true
}
```

## Understanding the Training Process

### Data Preparation

The training script performs several preprocessing steps:

1. **Data Cleaning:**
   - Handles missing values (median imputation for numeric features)
   - Removes extreme outliers using IQR method
   - Converts categorical variables to numeric codes

2. **Feature Engineering:**
   - BMI categories (Underweight, Normal, Overweight, Obese)
   - Age categories (Teen, Young Adult, Adult, Mature)
   - Blood pressure categories (Normal, Hypertension)
   - Composite risk scores (Diabetes Risk Score, Overall Complication Score)
   - Pulse pressure calculation

3. **Data Scaling:**
   - StandardScaler for Logistic Regression
   - Original scale for tree-based models

### Model Training

Each model is trained with:
- **Train-test split:** 80% training, 20% testing
- **Cross-validation:** 5-fold CV to prevent overfitting
- **Stratification:** Ensures balanced class distribution

### Performance Metrics

The training outputs several metrics:

- **Accuracy:** Percentage of correct predictions
- **Cross-validation score:** Average accuracy across 5 folds
- **Feature importance:** Which features matter most for predictions

### Saved Model Contents

The `.pkl` file contains:
```python
{
    'models': {
        'random_forest': {'model': ..., 'scaler': None},
        'gradient_boosting': {'model': ..., 'scaler': None},
        'logistic_regression': {'model': ..., 'scaler': StandardScaler()}
    },
    'scalers': {...},
    'feature_names': [...],
    'feature_importance': {...}
}
```

## Retraining the Model

### When to Retrain

Consider retraining when:
- You have new health data available
- The model performance degrades
- You want to update feature engineering
- You add new health indicators

### How to Retrain

1. Update `Data/health_data.csv` with new records
2. Run the training script:
```bash
python train_models.py
```
3. Restart the backend to load the new model:
```bash
cd FastAPI_Backend
python run_server.py
```

### Updating the Dataset

The health dataset should have these columns:
- `Age`: Patient age
- `Systolic BP`: Systolic blood pressure
- `Diastolic`: Diastolic blood pressure
- `BS`: Blood sugar level
- `Body Temp`: Body temperature (°F)
- `BMI`: Body Mass Index
- `Heart Rate`: Heart rate (bpm)
- `Previous Complications`: Boolean (0/1)
- `Preexisting Diabetes`: Boolean (0/1)
- `Gestational Diabetes`: Boolean (0/1)
- `Mental Health`: Boolean (0/1)
- `Risk Level`: Target variable ('High' or 'Low')

## Troubleshooting

### Issue: "Health data file not found"
**Solution:** Ensure `Data/health_data.csv` exists in your project directory.

### Issue: "Failed to load or prepare data"
**Solution:** Check that your CSV file has the correct columns and format.

### Issue: Low accuracy scores
**Solution:** 
- Check data quality (missing values, outliers)
- Ensure balanced class distribution
- Consider collecting more training data

### Issue: Model file not saving
**Solution:** Check write permissions in the `FastAPI_Backend` directory.

## Advanced Configuration

### Hyperparameter Tuning

To customize model parameters, edit `FastAPI_Backend/pregnancy_ml_predictor.py`:

```python
models_config = {
    'random_forest': RandomForestClassifier(
        n_estimators=200,  # Increase for better accuracy
        max_depth=15,      # Adjust based on your data
        random_state=42
    ),
    # ... other models
}
```

### Adding New Features

To add new health indicators:

1. Update the `_engineer_features()` method in `pregnancy_ml_predictor.py`
2. Add the new feature to `feature_columns` in `train_models()`
3. Update your CSV file with the new column
4. Retrain the model

## Model Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Training Pipeline                        │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  1. Data Loading                                             │
│     └─> health_data.csv                                      │
│                                                              │
│  2. Data Cleaning                                            │
│     ├─> Missing value imputation                             │
│     ├─> Outlier removal                                      │
│     └─> Binary encoding                                      │
│                                                              │
│  3. Feature Engineering                                      │
│     ├─> BMI categories                                       │
│     ├─> Age categories                                       │
│     ├─> BP categories                                        │
│     ├─> Blood sugar categories                               │
│     └─> Composite risk scores                                │
│                                                              │
│  4. Model Training                                           │
│     ├─> Random Forest (n=100 trees)                          │
│     ├─> Gradient Boosting (n=100 estimators)                 │
│     └─> Logistic Regression (L2 regularization)              │
│                                                              │
│  5. Model Evaluation                                         │
│     ├─> Test accuracy                                        │
│     ├─> Cross-validation (5-fold)                            │
│     └─> Feature importance                                   │
│                                                              │
│  6. Model Persistence                                        │
│     └─> pregnancy_risk_model.pkl                             │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## Integration with Backend

Once trained, the model is used by the FastAPI backend:

1. **Model Loading:** Backend loads the `.pkl` file on startup
2. **Prediction Endpoint:** `/predict_pregnancy_risk` uses the model
3. **Performance Endpoint:** `/model_performance` shows model info
4. **Batch Processing:** `/batch_risk_assessment` handles multiple predictions

## Performance Benchmarks

Expected training times (on standard hardware):
- Data loading: ~1 second
- Feature engineering: ~2 seconds
- Model training: 10-30 seconds
- Total: ~35 seconds

Expected inference times:
- Single prediction: <10ms
- Batch of 100: ~500ms

## Best Practices

1. **Always backup your data** before retraining
2. **Version your models** by adding timestamps to filenames
3. **Monitor model performance** over time
4. **Keep training and production data separate**
5. **Document any changes** to features or preprocessing

## References

- Scikit-learn documentation: https://scikit-learn.org/
- Random Forest: [Paper](https://www.stat.berkeley.edu/~breiman/randomforest2001.pdf)
- Gradient Boosting: [XGBoost](https://xgboost.readthedocs.io/)

---

**Note:** This system is for educational/research purposes. Always consult healthcare professionals for medical decisions.
