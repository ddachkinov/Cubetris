using UnityEngine;
using System;

namespace Cubetris
{
    /// <summary>
    /// Controls individual voxel behavior for explosion effects.
    /// Handles lifetime, fading, and pooling.
    /// </summary>
    [RequireComponent(typeof(Rigidbody))]
    public class VoxelController : MonoBehaviour
    {
        [Header("Voxel State")]
        [SerializeField] private Color voxelColor;
        [SerializeField] private float lifetime = 2f;
        [SerializeField] private float fadeStartTime = 1f;

        [Header("Fade Settings")]
        [SerializeField] private bool useFade = true;
        [SerializeField] private bool useScaleFade = true;
        [SerializeField] private AnimationCurve fadeCurve = AnimationCurve.Linear(0, 1, 1, 0);

        private Renderer voxelRenderer;
        private MaterialPropertyBlock propertyBlock;
        private Rigidbody rb;

        private float spawnTime;
        private bool isInitialized = false;
        private Vector3 initialScale;

        public event Action OnVoxelDestroyed;

        private void Awake()
        {
            voxelRenderer = GetComponent<Renderer>();
            rb = GetComponent<Rigidbody>();
            propertyBlock = new MaterialPropertyBlock();

            // Configure rigidbody for voxels
            if (rb != null)
            {
                rb.mass = 0.1f;
                rb.drag = 0.5f;
                rb.angularDrag = 0.5f;
                rb.collisionDetectionMode = CollisionDetectionMode.Discrete;
            }

            initialScale = transform.localScale;
        }

        /// <summary>
        /// Initialize voxel with color and lifetime.
        /// </summary>
        public void Initialize(Color color, float voxelLifetime, float fadeStart)
        {
            voxelColor = color;
            lifetime = voxelLifetime;
            fadeStartTime = fadeStart;
            spawnTime = Time.time;
            isInitialized = true;

            // Apply color
            if (voxelRenderer != null)
            {
                voxelRenderer.GetPropertyBlock(propertyBlock);
                propertyBlock.SetColor("_Color", voxelColor);
                voxelRenderer.SetPropertyBlock(propertyBlock);
            }

            // Reset scale
            transform.localScale = initialScale;

            // Enable renderer
            if (voxelRenderer != null)
            {
                voxelRenderer.enabled = true;
            }

            // Wake up rigidbody
            if (rb != null)
            {
                rb.WakeUp();
            }
        }

        private void Update()
        {
            if (!isInitialized) return;

            float age = Time.time - spawnTime;

            // Update fade
            if (useFade && age >= fadeStartTime)
            {
                UpdateFade(age);
            }

            // Check lifetime
            if (age >= lifetime)
            {
                DestroyVoxel();
            }
        }

        /// <summary>
        /// Update voxel fade based on age.
        /// </summary>
        private void UpdateFade(float age)
        {
            float fadeProgress = (age - fadeStartTime) / (lifetime - fadeStartTime);
            fadeProgress = Mathf.Clamp01(fadeProgress);

            float fadeValue = fadeCurve.Evaluate(fadeProgress);

            // Apply alpha fade
            if (voxelRenderer != null)
            {
                Color fadedColor = voxelColor;
                fadedColor.a = fadeValue;

                voxelRenderer.GetPropertyBlock(propertyBlock);
                propertyBlock.SetColor("_Color", fadedColor);
                voxelRenderer.SetPropertyBlock(propertyBlock);
            }

            // Apply scale fade
            if (useScaleFade)
            {
                transform.localScale = initialScale * fadeValue;
            }
        }

        /// <summary>
        /// Destroy this voxel and return to pool.
        /// </summary>
        private void DestroyVoxel()
        {
            isInitialized = false;

            OnVoxelDestroyed?.Invoke();

            if (ObjectPool.Instance != null)
            {
                ObjectPool.Instance.ReturnVoxel(gameObject);
            }
            else
            {
                Destroy(gameObject);
            }
        }

        /// <summary>
        /// Force destroy voxel immediately.
        /// </summary>
        public void ForceDestroy()
        {
            DestroyVoxel();
        }

        /// <summary>
        /// Reset voxel state for pooling.
        /// </summary>
        public void ResetVoxel()
        {
            isInitialized = false;
            voxelColor = Color.white;
            spawnTime = 0f;

            if (rb != null)
            {
                rb.velocity = Vector3.zero;
                rb.angularVelocity = Vector3.zero;
            }

            transform.localScale = initialScale;

            if (voxelRenderer != null)
            {
                voxelRenderer.enabled = false;
            }
        }
    }
}
